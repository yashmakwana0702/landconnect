"""Call signaling state machine: initiate, receive, accept/reject, end, timeout."""

import uuid

import httpx
import jwt

from app import db
from app.services import call_service
from tests.conftest import Account, EventLog, make_user


async def _pair(client: httpx.AsyncClient) -> tuple[Account, Account, str]:
    buyer = await make_user(client, "buyer", "Caller")
    seller = await make_user(client, "seller", "Callee")
    conv = (await client.post("/conversations", json={"member_ids": [seller.id]}, headers=buyer.headers)).json()
    return buyer, seller, conv["id"]


async def _start(client: httpx.AsyncClient, caller: Account, conv_id: str, kind: str = "video") -> httpx.Response:
    return await client.post("/calls", json={"conversation_id": conv_id, "kind": kind}, headers=caller.headers)


async def test_full_call_lifecycle(client: httpx.AsyncClient, events: EventLog) -> None:
    caller, callee, conv_id = await _pair(client)
    started = await _start(client, caller, conv_id)
    assert started.status_code == 201
    session = started.json()
    call_id = session["call"]["id"]
    assert session["call"]["status"] == "ringing"

    claims = jwt.decode(session["livekit"]["token"], options={"verify_signature": False})
    assert claims["sub"] == caller.id and claims["video"]["room"].startswith("call-")
    assert claims["name"] == "Caller"  # display name only, no phone/email

    incoming = events.for_user(callee.id, "call.incoming")
    assert incoming and incoming[0].data["caller"]["display_name"] == "Caller"

    accepted = await client.post(f"/calls/{call_id}/accept", headers=callee.headers)
    assert accepted.status_code == 200
    assert accepted.json()["call"]["status"] == "active"
    assert accepted.json()["livekit"]["room"] == session["livekit"]["room"]
    assert events.for_user(caller.id, "call.accepted")

    ended = await client.post(f"/calls/{call_id}/end", headers=caller.headers)
    assert ended.json()["status"] == "ended"
    assert events.for_user(callee.id, "call.ended")
    again = await client.post(f"/calls/{call_id}/end", headers=callee.headers)
    assert again.status_code == 200 and again.json()["status"] == "ended"  # idempotent

    log = (await client.get(f"/conversations/{conv_id}/messages", headers=callee.headers)).json()
    assert log[-1]["kind"] == "call" and log[-1]["body"].startswith("Video call")
    history = (await client.get("/calls", headers=callee.headers)).json()
    assert history[0]["id"] == call_id


async def test_reject_and_cancel(client: httpx.AsyncClient, events: EventLog) -> None:
    caller, callee, conv_id = await _pair(client)
    call_id = (await _start(client, caller, conv_id, "audio")).json()["call"]["id"]
    assert (await client.post(f"/calls/{call_id}/accept", headers=caller.headers)).status_code == 403
    rejected = await client.post(f"/calls/{call_id}/reject", headers=callee.headers)
    assert rejected.json()["status"] == "rejected"
    assert events.for_user(caller.id, "call.rejected")
    assert (await client.post(f"/calls/{call_id}/accept", headers=callee.headers)).status_code == 409

    call_id = (await _start(client, caller, conv_id)).json()["call"]["id"]
    cancelled = await client.post(f"/calls/{call_id}/end", headers=caller.headers)
    assert cancelled.json()["status"] == "cancelled"
    assert events.for_user(callee.id, "call.cancelled")


async def test_busy_and_privacy_switch(client: httpx.AsyncClient, events: EventLog) -> None:
    caller, callee, conv_id = await _pair(client)
    third = await make_user(client, "broker", "Third")
    conv2 = (await client.post("/conversations", json={"member_ids": [callee.id]}, headers=third.headers)).json()

    await _start(client, caller, conv_id)
    busy = await _start(client, third, conv2["id"])
    assert busy.status_code == 409

    await client.patch("/me", json={"calls_enabled": False}, headers=callee.headers)
    blocked = await _start(client, caller, conv_id)
    assert blocked.status_code == 403


async def test_outsider_and_group_rules(client: httpx.AsyncClient, events: EventLog) -> None:
    caller, callee, conv_id = await _pair(client)
    outsider = await make_user(client, "buyer", "Outsider")
    assert (await _start(client, outsider, conv_id)).status_code == 404
    call_id = (await _start(client, caller, conv_id)).json()["call"]["id"]
    assert (await client.post(f"/calls/{call_id}/end", headers=outsider.headers)).status_code == 404

    group = (
        await client.post("/conversations", json={"member_ids": [callee.id, outsider.id], "title": "G"}, headers=caller.headers)
    ).json()
    assert (await _start(client, caller, group["id"])).status_code == 409


async def test_unanswered_call_becomes_missed(client: httpx.AsyncClient, events: EventLog) -> None:
    caller, callee, conv_id = await _pair(client)
    call_id = (await _start(client, caller, conv_id, "audio")).json()["call"]["id"]
    await call_service._ring_timeout(uuid.UUID(call_id), 0, db.SessionLocal)
    state = (await client.get(f"/calls/{call_id}", headers=caller.headers)).json()
    assert state["status"] == "missed"
    assert events.for_user(callee.id, "call.missed") and events.for_user(caller.id, "call.missed")
    log = (await client.get(f"/conversations/{conv_id}/messages", headers=callee.headers)).json()
    assert log[-1]["body"] == "Missed voice call"

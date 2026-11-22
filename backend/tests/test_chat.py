"""Conversations, messages, realtime fan-out and meeting rooms."""

import httpx

from tests.conftest import SAMPLE_LISTING, EventLog, make_user


async def test_direct_chat_dedupes_and_delivers(client: httpx.AsyncClient, events: EventLog) -> None:
    buyer = await make_user(client, "buyer", "Asha")
    seller = await make_user(client, "seller", "Vikram")
    listing = (await client.post("/listings", json=SAMPLE_LISTING, headers=seller.headers)).json()

    body = {"member_ids": [seller.id], "listing_id": listing["id"]}
    first = (await client.post("/conversations", json=body, headers=buyer.headers)).json()
    again = (await client.post("/conversations", json=body, headers=buyer.headers)).json()
    assert first["id"] == again["id"]
    assert first["listing"]["title"] == SAMPLE_LISTING["title"]

    sent = await client.post(f"/conversations/{first['id']}/messages", json={"body": "Is it available?"}, headers=buyer.headers)
    assert sent.status_code == 201
    assert events.for_user(seller.id, "message.new")[0].data["body"] == "Is it available?"

    inbox = (await client.get("/conversations", headers=seller.headers)).json()
    assert inbox[0]["last_message"]["body"] == "Is it available?"
    history = (await client.get(f"/conversations/{first['id']}/messages", headers=seller.headers)).json()
    assert [m["body"] for m in history] == ["Is it available?"]


async def test_outsiders_cannot_read(client: httpx.AsyncClient) -> None:
    a = await make_user(client, "buyer", "Anil")
    b = await make_user(client, "seller", "Bina")
    c = await make_user(client, "broker", "Chetan")
    conv = (await client.post("/conversations", json={"member_ids": [b.id]}, headers=a.headers)).json()
    assert (await client.get(f"/conversations/{conv['id']}/messages", headers=c.headers)).status_code == 404


async def test_group_and_meeting_room(client: httpx.AsyncClient, events: EventLog) -> None:
    a = await make_user(client, "buyer", "Arjun")
    b = await make_user(client, "seller", "Bhavna")
    c = await make_user(client, "broker", "Kiran")
    group = (
        await client.post("/conversations", json={"member_ids": [b.id, c.id], "title": "Hoskote deal"}, headers=a.headers)
    ).json()
    assert group["is_group"] is True and len(group["members"]) == 3

    meeting = await client.post(f"/conversations/{group['id']}/meeting", headers=c.headers)
    assert meeting.status_code == 200
    creds = meeting.json()["livekit"]
    assert creds["room"] == f"meeting-{group['id']}" and creds["token"]
    assert events.for_user(a.id, "message.new")[-1].data["kind"] == "meeting"

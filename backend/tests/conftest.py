"""Test fixtures: throwaway SQLite DB, ASGI client and a recording event bus."""

import os
import tempfile
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

TMP_DIR: str = tempfile.mkdtemp(prefix="landconnect-tests-")
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + os.path.join(TMP_DIR, "test.db").replace("\\", "/")
os.environ["UPLOAD_DIR"] = os.path.join(TMP_DIR, "uploads")
os.environ["CALL_RING_TIMEOUT_S"] = "3600"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["LIVEKIT_URL"] = "wss://test.livekit.invalid"
os.environ["LIVEKIT_API_SECRET"] = "test-livekit-secret-at-least-32-bytes"
os.environ["JWT_SECRET"] = "test-jwt-secret-that-is-at-least-32-bytes"

import httpx  # noqa: E402
import pytest  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.realtime import manager  # noqa: E402


@dataclass
class Event:
    """One pushed realtime event."""

    user_ids: set[uuid.UUID]
    type: str
    data: dict[str, Any]


class EventLog:
    """Captures what `manager.send` would push over WebSockets."""

    def __init__(self) -> None:
        self.items: list[Event] = []

    async def send(self, user_ids: Any, event: str, data: Any) -> None:
        payload = data.model_dump(mode="json") if hasattr(data, "model_dump") else data
        self.items.append(Event(set(user_ids), event, payload))

    def for_user(self, user_id: str, event_type: str | None = None) -> list[Event]:
        uid = uuid.UUID(user_id)
        return [e for e in self.items if uid in e.user_ids and (event_type is None or e.type == event_type)]


@pytest.fixture(autouse=True)
async def fresh_db() -> AsyncIterator[None]:
    async with db.engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.drop_all)
        await conn.run_sync(db.Base.metadata.create_all)
    yield


@pytest.fixture
def events(monkeypatch: pytest.MonkeyPatch) -> EventLog:
    log = EventLog()
    monkeypatch.setattr(manager, "send", log.send)
    return log


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@dataclass
class Account:
    """A registered test user."""

    id: str
    token: str
    name: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


async def make_user(client: httpx.AsyncClient, role: str, name: str, phone: str | None = None) -> Account:
    """Register a user and return its id/token."""
    resp = await client.post(
        "/auth/register",
        json={
            "email": f"{name.lower()}@example.com",
            "password": "password123",
            "display_name": name,
            "role": role,
            "phone": phone,
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return Account(id=body["user"]["id"], token=body["access_token"], name=name)


SAMPLE_LISTING: dict[str, Any] = {
    "title": "5 acre plot near Hoskote",
    "description": "Clear title, road access, borewell water.",
    "price_inr": 25_000_000,
    "area_acres": 5,
    "locality": "Hoskote",
    "latitude": 13.07071,
    "longitude": 77.79823,
}

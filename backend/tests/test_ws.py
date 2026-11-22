"""WebSocket smoke test: auth and ping/pong."""

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from tests.conftest import make_user


def test_ws_rejects_bad_token() -> None:
    with TestClient(app) as tc, pytest.raises(WebSocketDisconnect):
        with tc.websocket_connect("/ws?token=bad") as ws:
            ws.receive_text()


async def test_ws_ping_pong(client: httpx.AsyncClient) -> None:
    user = await make_user(client, "buyer", "Wes")
    with TestClient(app) as tc, tc.websocket_connect(f"/ws?token={user.token}") as ws:
        ws.send_text("ping")
        assert ws.receive_text() == "pong"

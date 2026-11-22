"""WebSocket channel for server -> client events (messages, call signaling)."""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app import db
from app.models import User
from app.security import decode_access_token
from app.services.realtime import manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def events(ws: WebSocket, token: str = Query(...)) -> None:
    """Authenticate via `?token=<jwt>`, then push events until the client disconnects.

    Clients may send `ping`; the server answers `pong` (keeps mobile NATs open).
    """
    user_id = decode_access_token(token)
    async with db.SessionLocal() as session:
        user = await session.get(User, user_id) if user_id else None
    if user is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()
    manager.connect(user.id, ws)
    try:
        while True:
            if await ws.receive_text() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, ws)

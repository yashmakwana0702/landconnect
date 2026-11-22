"""In-process WebSocket fan-out keyed by user id.

Single-instance prototype: for horizontal scaling, replace the dict with
Redis pub/sub (publish per user channel, each instance forwards to its sockets).
"""

import logging
import uuid
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks open sockets per user and pushes JSON events to them."""

    def __init__(self) -> None:
        self._sockets: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: uuid.UUID, ws: WebSocket) -> None:
        """Register an accepted socket for a user."""
        self._sockets[user_id].add(ws)
        logger.info("ws connected user=%s sockets=%d", user_id, len(self._sockets[user_id]))

    def disconnect(self, user_id: uuid.UUID, ws: WebSocket) -> None:
        """Forget a socket (idempotent)."""
        self._sockets[user_id].discard(ws)
        if not self._sockets[user_id]:
            self._sockets.pop(user_id, None)

    def is_online(self, user_id: uuid.UUID) -> bool:
        """Whether the user has at least one open socket."""
        return bool(self._sockets.get(user_id))

    async def send(self, user_ids: Iterable[uuid.UUID], event: str, data: BaseModel | dict[str, Any]) -> None:
        """Send `{type, data}` to every socket of every given user; drop dead sockets."""
        payload = {"type": event, "data": data.model_dump(mode="json") if isinstance(data, BaseModel) else data}
        for user_id in set(user_ids):
            for ws in list(self._sockets.get(user_id, ())):
                try:
                    await ws.send_json(payload)
                except Exception:  # noqa: BLE001 - a broken socket must not break the sender
                    logger.warning("dropping dead socket for user=%s", user_id)
                    self.disconnect(user_id, ws)


manager = ConnectionManager()

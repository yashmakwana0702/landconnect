"""1:1 call signaling: a small state machine persisted in Postgres.

    ringing --accept--> active --end--> ended
    ringing --reject--> rejected
    ringing --caller hangs up--> cancelled
    ringing --no answer (timeout)--> missed

Signaling events go over our WebSocket; audio/video goes through LiveKit.
Each transition is a conditional UPDATE (`WHERE status = 'ringing'`), so a
race between accept, reject and timeout has exactly one winner.
"""

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import db
from app.config import get_settings
from app.errors import Conflict, Forbidden, NotFound
from app.models import Call, CallKind, CallStatus, Conversation, MessageKind, User
from app.schemas import CallCreate, CallOut, CallSession
from app.services import chat_service
from app.services.livekit_tokens import room_credentials
from app.services.realtime import manager

logger = logging.getLogger(__name__)

LIVE_STATUSES: tuple[CallStatus, ...] = (CallStatus.RINGING, CallStatus.ACTIVE)
STALE_ACTIVE_AFTER: timedelta = timedelta(hours=3)
HISTORY_LIMIT: int = 50
_timeout_tasks: set[asyncio.Task[None]] = set()


def _label(kind: CallKind) -> str:
    return "Video call" if kind == CallKind.VIDEO else "Voice call"


def _log_text(call: Call) -> str:
    """Human-readable call-log line posted into the chat."""
    label = _label(call.kind)
    if call.status == CallStatus.ENDED and call.answered_at and call.ended_at:
        secs = int((call.ended_at - call.answered_at).total_seconds())
        return f"{label} · {secs // 60}:{secs % 60:02d}"
    return {
        CallStatus.REJECTED: f"{label} · declined",
        CallStatus.MISSED: f"Missed {label.lower()}",
        CallStatus.CANCELLED: f"{label} · cancelled",
    }.get(call.status, label)


async def _get(session: AsyncSession, call_id: uuid.UUID, user: User) -> Call:
    call = await session.get(Call, call_id, populate_existing=True)
    if call is None or user.id not in (call.caller_id, call.callee_id):
        raise NotFound("Call not found")
    return call


async def _transition(
    session: AsyncSession, call_id: uuid.UUID, from_status: CallStatus, to_status: CallStatus
) -> bool:
    """Atomically move a call between states. Returns False if someone else won the race."""
    now = datetime.now(UTC)
    values: dict[str, object] = {"status": to_status}
    if to_status == CallStatus.ACTIVE:
        values["answered_at"] = now
    else:
        values["ended_at"] = now
    result = await session.execute(
        update(Call).where(Call.id == call_id, Call.status == from_status).values(**values)
    )
    await session.commit()
    return result.rowcount == 1


async def _finish(session: AsyncSession, call: Call, event: str) -> CallOut:
    """Notify both parties and drop a call-log line into the conversation."""
    call = await session.get(Call, call.id, populate_existing=True)
    assert call is not None
    out = CallOut.model_validate(call)
    await manager.send([call.caller_id, call.callee_id], event, out)
    conv = await session.get(Conversation, call.conversation_id)
    if conv is not None:
        await chat_service.post_message(session, conv, call.caller, _log_text(call), MessageKind.CALL)
    return out


async def _end_stale_calls(session: AsyncSession, user: User) -> None:
    """A user starting a new call cannot still be in an old one (e.g. app was killed)."""
    now = datetime.now(UTC)
    await session.execute(
        update(Call)
        .where(or_(Call.caller_id == user.id, Call.callee_id == user.id), Call.status.in_(LIVE_STATUSES))
        .values(status=CallStatus.ENDED, ended_at=now)
    )


async def _is_busy(session: AsyncSession, user_id: uuid.UUID) -> bool:
    cutoff = datetime.now(UTC) - STALE_ACTIVE_AFTER
    stmt = select(Call.id).where(
        or_(Call.caller_id == user_id, Call.callee_id == user_id),
        or_(Call.status == CallStatus.RINGING, (Call.status == CallStatus.ACTIVE) & (Call.answered_at > cutoff)),
    )
    return (await session.scalar(stmt.limit(1))) is not None


async def start_call(session: AsyncSession, caller: User, data: CallCreate) -> CallSession:
    """Create a ringing call, ring the callee over WebSocket, return the caller's media token."""
    conv = await chat_service.get_for_member(session, data.conversation_id, caller)
    if conv.is_group:
        raise Conflict("Use the meeting room for group calls")
    callee = next(m.user for m in conv.members if m.user_id != caller.id)
    if not callee.calls_enabled:
        raise Forbidden(f"{callee.display_name} is not accepting calls right now")
    await _end_stale_calls(session, caller)
    if await _is_busy(session, callee.id):
        raise Conflict(f"{callee.display_name} is on another call")

    call = Call(
        conversation_id=conv.id,
        caller_id=caller.id,
        callee_id=callee.id,
        kind=data.kind,
        room_name=f"call-{uuid.uuid4().hex}",
    )
    session.add(call)
    await session.commit()
    call = await _get(session, call.id, caller)
    out = CallOut.model_validate(call)
    await manager.send([callee.id], "call.incoming", out)
    _schedule_timeout(call.id)
    logger.info("call %s ringing %s -> %s (%s)", call.id, caller.id, callee.id, call.kind.value)
    return CallSession(call=out, livekit=room_credentials(caller, call.room_name))


async def accept(session: AsyncSession, call_id: uuid.UUID, user: User) -> CallSession:
    """Callee answers; caller is told to start the timer. Only the callee may accept."""
    call = await _get(session, call_id, user)
    if call.callee_id != user.id:
        raise Forbidden("Only the person being called can answer")
    if not await _transition(session, call.id, CallStatus.RINGING, CallStatus.ACTIVE):
        raise Conflict("This call is no longer ringing")
    call = await _get(session, call_id, user)
    out = CallOut.model_validate(call)
    await manager.send([call.caller_id, call.callee_id], "call.accepted", out)
    return CallSession(call=out, livekit=room_credentials(user, call.room_name))


async def reject(session: AsyncSession, call_id: uuid.UUID, user: User) -> CallOut:
    """Callee declines a ringing call."""
    call = await _get(session, call_id, user)
    if call.callee_id != user.id:
        raise Forbidden("Only the person being called can decline")
    if not await _transition(session, call.id, CallStatus.RINGING, CallStatus.REJECTED):
        raise Conflict("This call is no longer ringing")
    return await _finish(session, call, "call.rejected")


async def end(session: AsyncSession, call_id: uuid.UUID, user: User) -> CallOut:
    """Hang up. Ringing + caller => cancelled; ringing + callee => rejected; active => ended.

    Idempotent: ending an already-finished call returns its final state.
    """
    call = await _get(session, call_id, user)
    if call.status == CallStatus.ACTIVE:
        if await _transition(session, call.id, CallStatus.ACTIVE, CallStatus.ENDED):
            return await _finish(session, call, "call.ended")
    elif call.status == CallStatus.RINGING:
        is_caller = call.caller_id == user.id
        target, event = (CallStatus.CANCELLED, "call.cancelled") if is_caller else (CallStatus.REJECTED, "call.rejected")
        if await _transition(session, call.id, CallStatus.RINGING, target):
            return await _finish(session, call, event)
    return CallOut.model_validate(await _get(session, call_id, user))


async def history(session: AsyncSession, user: User) -> list[CallOut]:
    """Recent calls involving the user, newest first."""
    stmt = (
        select(Call)
        .where(or_(Call.caller_id == user.id, Call.callee_id == user.id))
        .order_by(Call.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    return [CallOut.model_validate(c) for c in (await session.scalars(stmt)).unique()]


async def get(session: AsyncSession, call_id: uuid.UUID, user: User) -> CallOut:
    """Current state of a call (used by clients to resync after reconnecting)."""
    return CallOut.model_validate(await _get(session, call_id, user))


def _schedule_timeout(call_id: uuid.UUID) -> None:
    task = asyncio.create_task(_ring_timeout(call_id, get_settings().call_ring_timeout_s, db.SessionLocal))
    _timeout_tasks.add(task)
    task.add_done_callback(_timeout_tasks.discard)


async def _ring_timeout(call_id: uuid.UUID, delay_s: float, factory: async_sessionmaker[AsyncSession]) -> None:
    """Mark the call missed if nobody answered within `delay_s`."""
    await asyncio.sleep(delay_s)
    try:
        async with factory() as session:
            if await _transition(session, call_id, CallStatus.RINGING, CallStatus.MISSED):
                call = await session.get(Call, call_id)
                assert call is not None
                await _finish(session, call, "call.missed")
                logger.info("call %s missed (no answer in %ss)", call_id, delay_s)
    except Exception:  # noqa: BLE001 - background task: log, never crash the loop
        logger.exception("ring timeout failed for call %s", call_id)

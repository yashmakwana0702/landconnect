"""Call signaling endpoints (media itself goes through LiveKit)."""

import uuid

from fastapi import APIRouter

from app.deps import CurrentUser, SessionDep
from app.schemas import CallCreate, CallOut, CallSession
from app.services import call_service

router = APIRouter(prefix="/calls", tags=["calls"])


@router.post("", response_model=CallSession, status_code=201)
async def start_call(data: CallCreate, user: CurrentUser, session: SessionDep) -> CallSession:
    """Ring the other member of a 1:1 conversation. Returns the caller's room token."""
    return await call_service.start_call(session, user, data)


@router.get("", response_model=list[CallOut])
async def call_history(user: CurrentUser, session: SessionDep) -> list[CallOut]:
    """Recent calls for the Calls tab."""
    return await call_service.history(session, user)


@router.get("/{call_id}", response_model=CallOut)
async def get_call(call_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CallOut:
    """Current call state (for resync after a reconnect)."""
    return await call_service.get(session, call_id, user)


@router.post("/{call_id}/accept", response_model=CallSession)
async def accept_call(call_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CallSession:
    """Answer a ringing call. Returns the callee's room token."""
    return await call_service.accept(session, call_id, user)


@router.post("/{call_id}/reject", response_model=CallOut)
async def reject_call(call_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CallOut:
    """Decline a ringing call."""
    return await call_service.reject(session, call_id, user)


@router.post("/{call_id}/end", response_model=CallOut)
async def end_call(call_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> CallOut:
    """Hang up (cancels if still ringing). Idempotent."""
    return await call_service.end(session, call_id, user)

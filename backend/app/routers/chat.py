"""Conversations, messages and meeting rooms."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.deps import CurrentUser, SessionDep
from app.schemas import ConversationCreate, ConversationOut, MeetingOut, MessageIn, MessageOut
from app.services import chat_service

router = APIRouter(prefix="/conversations", tags=["chat"])


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: CurrentUser, session: SessionDep) -> list[ConversationOut]:
    """Chat list, most recent first."""
    return await chat_service.list_for_user(session, user)


@router.post("", response_model=ConversationOut)
async def open_conversation(data: ConversationCreate, user: CurrentUser, session: SessionDep) -> ConversationOut:
    """Get-or-create a 1:1 chat (optionally about a listing) or create a group."""
    return await chat_service.open_conversation(session, user, data)


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> ConversationOut:
    """One conversation (members only)."""
    conv = await chat_service.get_for_member(session, conversation_id, user)
    return chat_service.to_out(conv, None)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conversation_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    before: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[MessageOut]:
    """Message history, oldest-to-newest within the page."""
    conv = await chat_service.get_for_member(session, conversation_id, user)
    return await chat_service.list_messages(session, conv, before, limit)


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    conversation_id: uuid.UUID, data: MessageIn, user: CurrentUser, session: SessionDep
) -> MessageOut:
    """Send a text message; members receive it live over the WebSocket."""
    conv = await chat_service.get_for_member(session, conversation_id, user)
    return await chat_service.post_message(session, conv, user, data.body)


@router.post("/{conversation_id}/meeting", response_model=MeetingOut)
async def join_meeting(conversation_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> MeetingOut:
    """Join the conversation's always-available meeting room (group video)."""
    conv = await chat_service.get_for_member(session, conversation_id, user)
    return await chat_service.join_meeting(session, conv, user)

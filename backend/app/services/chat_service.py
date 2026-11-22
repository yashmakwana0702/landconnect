"""Conversations, messages and meeting rooms."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import BadRequest, NotFound
from app.models import Conversation, ConversationMember, Listing, Message, MessageKind, User
from app.schemas import (
    ConversationCreate,
    ConversationOut,
    ListingSummary,
    MeetingOut,
    MessageOut,
    PublicUser,
)
from app.services.livekit_tokens import room_credentials
from app.services.realtime import manager

MESSAGE_PAGE_MAX: int = 100


def member_ids(conv: Conversation) -> list[uuid.UUID]:
    """User ids of all members."""
    return [m.user_id for m in conv.members]


def to_out(conv: Conversation, last: Message | None) -> ConversationOut:
    """Serialize a conversation with its latest message."""
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        is_group=conv.is_group,
        listing=ListingSummary.model_validate(conv.listing) if conv.listing else None,
        members=[PublicUser.model_validate(m.user) for m in conv.members],
        last_message=MessageOut.model_validate(last) if last else None,
        last_message_at=conv.last_message_at,
    )


async def get_for_member(session: AsyncSession, conversation_id: uuid.UUID, user: User) -> Conversation:
    """Load a conversation, ensuring `user` is a member (404 hides existence from outsiders)."""
    conv = await session.get(Conversation, conversation_id)
    if conv is None or user.id not in member_ids(conv):
        raise NotFound("Conversation not found")
    return conv


async def _find_direct(
    session: AsyncSession, a: uuid.UUID, b: uuid.UUID, listing_id: uuid.UUID | None
) -> Conversation | None:
    """Find an existing 1:1 conversation between a and b about the same listing."""
    both = (
        select(ConversationMember.conversation_id)
        .where(ConversationMember.user_id.in_([a, b]))
        .group_by(ConversationMember.conversation_id)
        .having(func.count() == 2)
    )
    stmt = select(Conversation).where(Conversation.is_group.is_(False), Conversation.id.in_(both))
    stmt = stmt.where(
        Conversation.listing_id == listing_id if listing_id else Conversation.listing_id.is_(None)
    )
    return (await session.scalars(stmt)).unique().first()


async def open_conversation(session: AsyncSession, me: User, data: ConversationCreate) -> ConversationOut:
    """Get-or-create a 1:1 chat, or create a group chat."""
    others = sorted({uid for uid in data.member_ids if uid != me.id})
    if not others:
        raise BadRequest("Add at least one other member")
    found = await session.scalars(select(User.id).where(User.id.in_(others)))
    if len(set(found)) != len(others):
        raise NotFound("One or more users do not exist")
    if data.listing_id and await session.get(Listing, data.listing_id) is None:
        raise NotFound("Listing not found")

    is_group = len(others) > 1
    if not is_group:
        existing = await _find_direct(session, me.id, others[0], data.listing_id)
        if existing:
            return to_out(existing, await _last_message(session, existing.id))

    conv = Conversation(title=data.title if is_group else None, is_group=is_group, listing_id=data.listing_id)
    conv.members = [ConversationMember(user_id=uid) for uid in [me.id, *others]]
    session.add(conv)
    await session.commit()
    conv = await session.get(Conversation, conv.id, populate_existing=True)
    assert conv is not None
    return to_out(conv, None)


async def list_for_user(session: AsyncSession, me: User) -> list[ConversationOut]:
    """All conversations of `me`, most recently active first, with last-message previews."""
    mine = select(ConversationMember.conversation_id).where(ConversationMember.user_id == me.id)
    convs = list(
        (await session.scalars(
            select(Conversation).where(Conversation.id.in_(mine)).order_by(Conversation.last_message_at.desc())
        )).unique()
    )
    last = await _last_messages(session, [c.id for c in convs])
    return [to_out(c, last.get(c.id)) for c in convs]


async def _last_messages(session: AsyncSession, conv_ids: list[uuid.UUID]) -> dict[uuid.UUID, Message]:
    """Latest message per conversation in one query (window function, works on Postgres and SQLite)."""
    if not conv_ids:
        return {}
    rn = func.row_number().over(partition_by=Message.conversation_id, order_by=Message.created_at.desc())
    ranked = select(Message.id, rn.label("rn")).where(Message.conversation_id.in_(conv_ids)).subquery()
    stmt = select(Message).join(ranked, ranked.c.id == Message.id).where(ranked.c.rn == 1)
    return {m.conversation_id: m for m in await session.scalars(stmt)}


async def _last_message(session: AsyncSession, conv_id: uuid.UUID) -> Message | None:
    return (await _last_messages(session, [conv_id])).get(conv_id)


async def list_messages(
    session: AsyncSession, conv: Conversation, before: datetime | None, limit: int
) -> list[MessageOut]:
    """A page of messages in chronological order (pass `before` to page backwards)."""
    stmt = select(Message).where(Message.conversation_id == conv.id)
    if before:
        stmt = stmt.where(Message.created_at < before)
    stmt = stmt.order_by(Message.created_at.desc()).limit(min(limit, MESSAGE_PAGE_MAX))
    rows = list(await session.scalars(stmt))
    return [MessageOut.model_validate(m) for m in reversed(rows)]


async def post_message(
    session: AsyncSession,
    conv: Conversation,
    sender: User,
    body: str,
    kind: MessageKind = MessageKind.TEXT,
) -> MessageOut:
    """Persist a message, bump the conversation, and push `message.new` to all members."""
    now = datetime.now(UTC)
    msg = Message(conversation_id=conv.id, sender_id=sender.id, kind=kind, body=body.strip(), created_at=now)
    session.add(msg)
    conv.last_message_at = now
    await session.commit()
    out = MessageOut.model_validate(msg)
    await manager.send(member_ids(conv), "message.new", out)
    return out


async def join_meeting(session: AsyncSession, conv: Conversation, user: User) -> MeetingOut:
    """Issue meeting-room credentials and announce the join in the chat."""
    await post_message(session, conv, user, f"{user.display_name} joined the meeting room", MessageKind.MEETING)
    return MeetingOut(conversation_id=conv.id, livekit=room_credentials(user, f"meeting-{conv.id}"))

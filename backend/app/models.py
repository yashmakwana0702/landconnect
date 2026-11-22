"""ORM models: users, listings, conversations/messages and calls."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _enum(cls: type[enum.Enum]) -> Enum:
    """Portable enum column stored as VARCHAR + CHECK (works on Postgres and SQLite)."""
    return Enum(cls, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e])


class Role(str, enum.Enum):
    """Marketplace roles."""

    BUYER = "buyer"
    SELLER = "seller"
    BROKER = "broker"


class ListingStatus(str, enum.Enum):
    """Lifecycle of a listing."""

    ACTIVE = "active"
    SOLD = "sold"


class MessageKind(str, enum.Enum):
    """Chat message types; non-text kinds are system events rendered inline."""

    TEXT = "text"
    CALL = "call"
    MEETING = "meeting"


class CallKind(str, enum.Enum):
    """Media type of a call."""

    AUDIO = "audio"
    VIDEO = "video"


class CallStatus(str, enum.Enum):
    """Call state machine: ringing -> active -> ended, or ringing -> rejected/missed/cancelled."""

    RINGING = "ringing"
    ACTIVE = "active"
    REJECTED = "rejected"
    MISSED = "missed"
    CANCELLED = "cancelled"
    ENDED = "ended"


class User(Base):
    """A marketplace account. `phone` is private and never exposed to other users."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[Role] = mapped_column(_enum(Role))
    phone: Mapped[str | None] = mapped_column(String(20), default=None)
    calls_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    """A land parcel offered by a seller or broker."""

    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(140))
    description: Mapped[str] = mapped_column(Text, default="")
    price_inr: Mapped[int] = mapped_column(BigInteger)
    area_acres: Mapped[float] = mapped_column(Float)
    locality: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    hide_exact_location: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[ListingStatus] = mapped_column(_enum(ListingStatus), default=ListingStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(lazy="joined")
    images: Mapped[list["ListingImage"]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ListingImage.position",
    )


class ListingImage(Base):
    """An uploaded photo of a listing (stored on disk, served under /uploads)."""

    __tablename__ = "listing_images"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer, default=0)

    listing: Mapped[Listing] = relationship(back_populates="images")


class Conversation(Base):
    """A 1:1 or group chat, optionally about a specific listing."""

    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str | None] = mapped_column(String(120), default=None)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("listings.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["ConversationMember"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    listing: Mapped[Listing | None] = relationship(lazy="joined")


class ConversationMember(Base):
    """Membership row linking a user to a conversation."""

    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    user: Mapped[User] = relationship(lazy="joined")


class Message(Base):
    """A chat message or an inline system event (call log, meeting started)."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[MessageKind] = mapped_column(_enum(MessageKind), default=MessageKind.TEXT)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class Call(Base):
    """A 1:1 audio/video call. Media flows through LiveKit room `room_name`."""

    __tablename__ = "calls"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    caller_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    callee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[CallKind] = mapped_column(_enum(CallKind))
    status: Mapped[CallStatus] = mapped_column(_enum(CallStatus), default=CallStatus.RINGING)
    room_name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    caller: Mapped[User] = relationship(foreign_keys=[caller_id], lazy="joined")
    callee: Mapped[User] = relationship(foreign_keys=[callee_id], lazy="joined")

"""Pydantic request/response models (the public API contract)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import CallKind, CallStatus, ListingStatus, MessageKind, Role


class ORMModel(BaseModel):
    """Base for response models built from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


# ---------- Auth / users ----------


class RegisterIn(BaseModel):
    """Registration payload. Phone is optional and stays private."""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=80)
    role: Role
    phone: str | None = Field(default=None, max_length=20)


class LoginIn(BaseModel):
    """Login payload."""

    email: EmailStr
    password: str


class PublicUser(ORMModel):
    """What other users may see about someone: no email, no phone."""

    id: uuid.UUID
    display_name: str
    role: Role


class MeOut(PublicUser):
    """The signed-in user's own profile, including private fields."""

    email: str
    phone: str | None
    calls_enabled: bool


class MeUpdate(BaseModel):
    """Editable profile and privacy fields."""

    display_name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    calls_enabled: bool | None = None


class TokenOut(BaseModel):
    """Login/register response."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: MeOut


# ---------- Listings ----------


class ListingBase(BaseModel):
    """Fields shared by create and read."""

    title: str = Field(min_length=3, max_length=140)
    description: str = Field(default="", max_length=5000)
    price_inr: int = Field(gt=0)
    area_acres: float = Field(gt=0)
    locality: str = Field(min_length=2, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    hide_exact_location: bool = False


class ListingCreate(ListingBase):
    """Create payload (images are uploaded separately)."""


class ListingUpdate(BaseModel):
    """Partial update payload."""

    title: str | None = Field(default=None, min_length=3, max_length=140)
    description: str | None = Field(default=None, max_length=5000)
    price_inr: int | None = Field(default=None, gt=0)
    area_acres: float | None = Field(default=None, gt=0)
    locality: str | None = Field(default=None, min_length=2, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    hide_exact_location: bool | None = None
    status: ListingStatus | None = None


class ImageOut(BaseModel):
    """A listing image; `url` is relative to the API base URL."""

    id: uuid.UUID
    url: str


class ListingOut(ListingBase):
    """Listing as seen by a specific viewer."""

    id: uuid.UUID
    owner: PublicUser
    status: ListingStatus
    images: list[ImageOut]
    is_mine: bool
    location_is_approximate: bool
    created_at: datetime
    updated_at: datetime


class ListingSummary(ORMModel):
    """Compact listing reference used in chats."""

    id: uuid.UUID
    title: str


# ---------- Chat ----------


class ConversationCreate(BaseModel):
    """Start a 1:1 chat (one member) or a group (several members + title)."""

    member_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)
    listing_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=120)


class MessageIn(BaseModel):
    """Send-message payload."""

    body: str = Field(min_length=1, max_length=4000)


class MessageOut(ORMModel):
    """A chat message or system event."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    kind: MessageKind
    body: str
    created_at: datetime


class ConversationOut(BaseModel):
    """Conversation with members and the latest message preview."""

    id: uuid.UUID
    title: str | None
    is_group: bool
    listing: ListingSummary | None
    members: list[PublicUser]
    last_message: MessageOut | None
    last_message_at: datetime


# ---------- Calls ----------


class CallCreate(BaseModel):
    """Start a 1:1 call inside an existing conversation."""

    conversation_id: uuid.UUID
    kind: CallKind


class CallOut(ORMModel):
    """Call record."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    kind: CallKind
    status: CallStatus
    caller: PublicUser
    callee: PublicUser
    created_at: datetime
    answered_at: datetime | None
    ended_at: datetime | None


class LiveKitCredentials(BaseModel):
    """What the client needs to join the media room."""

    url: str
    token: str
    room: str


class CallSession(BaseModel):
    """Call plus (when the caller is allowed to join) LiveKit credentials."""

    call: CallOut
    livekit: LiveKitCredentials | None = None


class MeetingOut(BaseModel):
    """Credentials for a conversation's meeting room."""

    conversation_id: uuid.UUID
    livekit: LiveKitCredentials


# ---------- AI matching ----------


class MatchRequest(BaseModel):
    """Free-text buyer requirement, e.g. "5-10 acres near Hoskote under 3 crore"."""

    query: str = Field(min_length=3, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)


class BuyerRequirements(BaseModel):
    """Structured requirements extracted from the buyer's text."""

    budget_min_inr: int | None = None
    budget_max_inr: int | None = None
    area_min_acres: float | None = None
    area_max_acres: float | None = None
    locations: list[str] = Field(default_factory=list)
    must_haves: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    """One ranked parcel with an explainable score."""

    listing: ListingOut
    score: float
    reasons: list[str]


class MatchResponse(BaseModel):
    """Matching output, including how the query was understood."""

    requirements: BuyerRequirements
    parsed_by: Literal["llm", "rules"]
    results: list[MatchResult]

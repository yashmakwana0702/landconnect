"""Auth and profile endpoints."""

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.deps import CurrentUser, SessionDep
from app.errors import NotFound
from app.models import Role, User
from app.schemas import LoginIn, MeOut, MeUpdate, PublicUser, RegisterIn, TokenOut
from app.services import auth_service

router = APIRouter(tags=["auth"])
USER_SEARCH_LIMIT: int = 30


@router.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(data: RegisterIn, session: SessionDep) -> TokenOut:
    """Create a Buyer, Seller or Broker account."""
    return await auth_service.register(session, data)


@router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn, session: SessionDep) -> TokenOut:
    """Exchange email + password for a bearer token."""
    return await auth_service.login(session, data)


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser) -> MeOut:
    """The signed-in user's profile (the only place the phone number is returned)."""
    return MeOut.model_validate(user)


@router.patch("/me", response_model=MeOut)
async def update_me(data: MeUpdate, user: CurrentUser, session: SessionDep) -> MeOut:
    """Update display name, private phone or the 'accept calls' privacy switch."""
    return await auth_service.update_me(session, user, data)


@router.get("/users", response_model=list[PublicUser])
async def search_users(
    user: CurrentUser,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=80),
    role: Role | None = None,
) -> list[PublicUser]:
    """Directory of public profiles (name + role only) for starting chats/groups."""
    stmt = select(User).where(User.id != user.id).order_by(User.display_name).limit(USER_SEARCH_LIMIT)
    if q:
        stmt = stmt.where(User.display_name.ilike(f"%{q}%"))
    if role:
        stmt = stmt.where(User.role == role)
    return [PublicUser.model_validate(u) for u in await session.scalars(stmt)]


@router.get("/users/{user_id}", response_model=PublicUser)
async def get_user(user_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> PublicUser:
    """Public profile of one user."""
    found = await session.get(User, user_id)
    if found is None:
        raise NotFound("User not found")
    return PublicUser.model_validate(found)

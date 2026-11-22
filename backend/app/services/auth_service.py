"""Registration, login and profile updates."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import Conflict, Unauthorized
from app.models import User
from app.schemas import LoginIn, MeOut, MeUpdate, RegisterIn, TokenOut
from app.security import create_access_token, hash_password, verify_password


def _token_for(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id, user.role.value), user=MeOut.model_validate(user))


async def register(session: AsyncSession, data: RegisterIn) -> TokenOut:
    """Create an account and return a token. Emails are case-insensitive."""
    email = data.email.lower()
    exists = await session.scalar(select(func.count()).select_from(User).where(User.email == email))
    if exists:
        raise Conflict("An account with this email already exists")
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        display_name=data.display_name.strip(),
        role=data.role,
        phone=data.phone,
    )
    session.add(user)
    await session.commit()
    return _token_for(user)


async def login(session: AsyncSession, data: LoginIn) -> TokenOut:
    """Verify credentials and return a token (same error for unknown email or bad password)."""
    user = await session.scalar(select(User).where(User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise Unauthorized("Incorrect email or password")
    return _token_for(user)


async def update_me(session: AsyncSession, user: User, data: MeUpdate) -> MeOut:
    """Apply profile/privacy changes."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await session.commit()
    return MeOut.model_validate(user)

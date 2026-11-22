"""LiveKit access-token minting. Media never touches our backend."""

from datetime import timedelta

from livekit import api

from app.config import get_settings
from app.models import User
from app.schemas import LiveKitCredentials

TOKEN_TTL: timedelta = timedelta(hours=2)


def room_credentials(user: User, room: str) -> LiveKitCredentials:
    """Mint a join-only token for `room`, scoped to this user's identity.

    The identity is the user id and the visible name is the display name, so
    participants never see each other's phone numbers or emails.
    """
    settings = get_settings()
    token = (
        api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(str(user.id))
        .with_name(user.display_name)
        .with_ttl(TOKEN_TTL)
        .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .to_jwt()
    )
    return LiveKitCredentials(url=settings.livekit_url, token=token, room=room)

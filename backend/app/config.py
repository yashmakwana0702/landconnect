"""Application settings loaded from environment variables / backend/.env."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE: str = os.path.join(PROJECT_ROOT, ".env")


class Settings(BaseSettings):
    """Typed runtime configuration.

    Attributes:
        database_url: SQLAlchemy async URL (postgresql+asyncpg://...).
        jwt_secret: HMAC secret for access tokens.
        jwt_ttl_minutes: Access-token lifetime.
        upload_dir: Directory where listing images are stored.
        max_upload_mb: Per-image size limit.
        livekit_url: Public ws(s):// URL the mobile app connects to.
        livekit_api_key: LiveKit API key used to sign room tokens.
        livekit_api_secret: LiveKit API secret used to sign room tokens.
        call_ring_timeout_s: Seconds before an unanswered call becomes "missed".
        anthropic_api_key: Optional; enables LLM parsing in buyer matching.
        anthropic_model: Claude model used for requirement extraction.
        cors_origins: Comma-separated list of allowed origins.
    """

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://landconnect:landconnect@localhost:5432/landconnect"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0000"
    jwt_ttl_minutes: int = 60 * 24 * 7
    upload_dir: str = os.path.join(PROJECT_ROOT, "uploads")
    max_upload_mb: int = 8
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"
    call_ring_timeout_s: int = 35
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings singleton."""
    return Settings()

"""Local-disk image storage served under /uploads (swap for S3/GCS in production)."""

import os
import uuid

import anyio
from fastapi import UploadFile

from app.config import get_settings
from app.errors import BadRequest

ALLOWED_TYPES: dict[str, str] = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
PUBLIC_PREFIX: str = "/uploads"


async def save_image(upload: UploadFile) -> str:
    """Validate and persist an uploaded image; return its stored file name."""
    settings = get_settings()
    ext = ALLOWED_TYPES.get(upload.content_type or "")
    if ext is None:
        raise BadRequest(f"Unsupported image type: {upload.content_type}")
    data = await upload.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise BadRequest(f"Image larger than {settings.max_upload_mb} MB")
    name = f"{uuid.uuid4().hex}{ext}"
    await anyio.Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    await anyio.Path(os.path.join(settings.upload_dir, name)).write_bytes(data)
    return name


async def delete_image(name: str) -> None:
    """Remove a stored image if present."""
    path = anyio.Path(os.path.join(get_settings().upload_dir, os.path.basename(name)))
    if await path.exists():
        await path.unlink()


def public_url(name: str) -> str:
    """Relative URL the client prefixes with the API base URL."""
    return name if name.startswith("http") else f"{PUBLIC_PREFIX}/{name}"

"""Listing endpoints. Reads: any signed-in user. Writes: owning seller/broker only."""

import uuid

from fastapi import APIRouter, File, Query, UploadFile

from app.deps import CurrentUser, ListingManager, SessionDep
from app.schemas import ListingCreate, ListingOut, ListingUpdate
from app.services import listing_service
from app.services.listing_service import ListingFilters

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("", response_model=list[ListingOut])
async def list_listings(
    user: CurrentUser,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=100),
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    min_area: float | None = Query(default=None, ge=0),
    max_area: float | None = Query(default=None, ge=0),
    mine: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ListingOut]:
    """Community feed (and map data); `mine=true` returns the caller's own listings."""
    filters = ListingFilters(q, min_price, max_price, min_area, max_area, mine, limit, offset)
    return [listing_service.to_out(item, user) for item in await listing_service.search(session, user, filters)]


@router.get("/{listing_id}", response_model=ListingOut)
async def get_listing(listing_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> ListingOut:
    """One listing."""
    return listing_service.to_out(await listing_service.get_visible(session, listing_id, user), user)


@router.post("", response_model=ListingOut, status_code=201)
async def create_listing(data: ListingCreate, user: ListingManager, session: SessionDep) -> ListingOut:
    """Create a listing (sellers and brokers)."""
    return listing_service.to_out(await listing_service.create(session, user, data), user)


@router.patch("/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: uuid.UUID, data: ListingUpdate, user: ListingManager, session: SessionDep
) -> ListingOut:
    """Edit your listing, including marking it sold."""
    listing = await listing_service.get_owned(session, listing_id, user)
    return listing_service.to_out(await listing_service.update(session, listing, data), user)


@router.delete("/{listing_id}", status_code=204)
async def delete_listing(listing_id: uuid.UUID, user: ListingManager, session: SessionDep) -> None:
    """Delete your listing and its images."""
    await listing_service.delete(session, await listing_service.get_owned(session, listing_id, user))


@router.post("/{listing_id}/images", response_model=ListingOut)
async def upload_images(
    listing_id: uuid.UUID,
    user: ListingManager,
    session: SessionDep,
    files: list[UploadFile] = File(...),
) -> ListingOut:
    """Upload one or more photos (multipart field name: `files`)."""
    listing = await listing_service.get_owned(session, listing_id, user)
    return listing_service.to_out(await listing_service.add_images(session, listing, files), user)


@router.delete("/{listing_id}/images/{image_id}", response_model=ListingOut)
async def delete_image(
    listing_id: uuid.UUID, image_id: uuid.UUID, user: ListingManager, session: SessionDep
) -> ListingOut:
    """Remove one photo."""
    listing = await listing_service.get_owned(session, listing_id, user)
    return listing_service.to_out(await listing_service.remove_image(session, listing, image_id), user)

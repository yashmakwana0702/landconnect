"""Listings CRUD, image management and viewer-aware serialization."""

import uuid
from dataclasses import dataclass

from fastapi import UploadFile
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import BadRequest, Forbidden, NotFound
from app.models import Listing, ListingImage, ListingStatus, User
from app.schemas import ImageOut, ListingCreate, ListingOut, ListingUpdate, PublicUser
from app.services import storage

MAX_IMAGES_PER_LISTING: int = 10
APPROX_DECIMALS: int = 2  # ~1.1 km precision for owners who hide the exact pin


@dataclass(frozen=True)
class ListingFilters:
    """Query filters for the community feed."""

    q: str | None = None
    min_price: int | None = None
    max_price: int | None = None
    min_area: float | None = None
    max_area: float | None = None
    mine: bool = False
    limit: int = 50
    offset: int = 0


def to_out(listing: Listing, viewer: User) -> ListingOut:
    """Serialize a listing for `viewer`, blurring the pin when the owner asked for it."""
    is_mine = listing.owner_id == viewer.id
    approximate = listing.hide_exact_location and not is_mine
    lat, lng = listing.latitude, listing.longitude
    if approximate:
        lat, lng = round(lat, APPROX_DECIMALS), round(lng, APPROX_DECIMALS)
    return ListingOut(
        id=listing.id,
        owner=PublicUser.model_validate(listing.owner),
        title=listing.title,
        description=listing.description,
        price_inr=listing.price_inr,
        area_acres=listing.area_acres,
        locality=listing.locality,
        latitude=lat,
        longitude=lng,
        hide_exact_location=listing.hide_exact_location,
        status=listing.status,
        images=[ImageOut(id=img.id, url=storage.public_url(img.path)) for img in listing.images],
        is_mine=is_mine,
        location_is_approximate=approximate,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
    )


async def search(session: AsyncSession, viewer: User, f: ListingFilters) -> list[Listing]:
    """Return listings matching filters, newest first. Others see only active ones."""
    stmt = select(Listing).order_by(Listing.created_at.desc()).limit(f.limit).offset(f.offset)
    if f.mine:
        stmt = stmt.where(Listing.owner_id == viewer.id)
    else:
        stmt = stmt.where(Listing.status == ListingStatus.ACTIVE)
    if f.q:
        like = f"%{f.q.strip()}%"
        stmt = stmt.where(or_(Listing.title.ilike(like), Listing.locality.ilike(like), Listing.description.ilike(like)))
    if f.min_price is not None:
        stmt = stmt.where(Listing.price_inr >= f.min_price)
    if f.max_price is not None:
        stmt = stmt.where(Listing.price_inr <= f.max_price)
    if f.min_area is not None:
        stmt = stmt.where(Listing.area_acres >= f.min_area)
    if f.max_area is not None:
        stmt = stmt.where(Listing.area_acres <= f.max_area)
    return list((await session.scalars(stmt)).unique())


async def get_visible(session: AsyncSession, listing_id: uuid.UUID, viewer: User) -> Listing:
    """Fetch a listing the viewer may see (owners also see sold ones)."""
    listing = await session.get(Listing, listing_id)
    if listing is None or (listing.status != ListingStatus.ACTIVE and listing.owner_id != viewer.id):
        raise NotFound("Listing not found")
    return listing


async def get_owned(session: AsyncSession, listing_id: uuid.UUID, user: User) -> Listing:
    """Fetch a listing and ensure `user` owns it."""
    listing = await session.get(Listing, listing_id)
    if listing is None:
        raise NotFound("Listing not found")
    if listing.owner_id != user.id:
        raise Forbidden("You can only manage your own listings")
    return listing


async def create(session: AsyncSession, owner: User, data: ListingCreate) -> Listing:
    """Create a listing owned by a seller/broker."""
    listing = Listing(owner_id=owner.id, **data.model_dump())
    session.add(listing)
    await session.commit()
    return await _reload(session, listing.id)


async def update(session: AsyncSession, listing: Listing, data: ListingUpdate) -> Listing:
    """Apply a partial update."""
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    await session.commit()
    return await _reload(session, listing.id)


async def delete(session: AsyncSession, listing: Listing) -> None:
    """Delete a listing and its stored images."""
    paths = [img.path for img in listing.images]
    await session.delete(listing)
    await session.commit()
    for path in paths:
        await storage.delete_image(path)


async def add_images(session: AsyncSession, listing: Listing, files: list[UploadFile]) -> Listing:
    """Store uploaded images and attach them in upload order."""
    if len(listing.images) + len(files) > MAX_IMAGES_PER_LISTING:
        raise BadRequest(f"A listing can have at most {MAX_IMAGES_PER_LISTING} images")
    start = len(listing.images)
    for offset, upload in enumerate(files):
        name = await storage.save_image(upload)
        session.add(ListingImage(listing_id=listing.id, path=name, position=start + offset))
    await session.commit()
    return await _reload(session, listing.id)


async def remove_image(session: AsyncSession, listing: Listing, image_id: uuid.UUID) -> Listing:
    """Detach and delete one image."""
    image = next((img for img in listing.images if img.id == image_id), None)
    if image is None:
        raise NotFound("Image not found")
    await session.delete(image)
    await session.commit()
    await storage.delete_image(image.path)
    return await _reload(session, listing.id)


async def _reload(session: AsyncSession, listing_id: uuid.UUID) -> Listing:
    """Re-read a listing with fresh relationships after a write."""
    listing = await session.get(Listing, listing_id, populate_existing=True)
    assert listing is not None
    return listing

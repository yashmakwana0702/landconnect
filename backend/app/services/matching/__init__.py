"""Buyer-to-parcel matching: extract requirements, then rank active listings."""

from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Listing, ListingStatus, User
from app.schemas import MatchRequest, MatchResponse, MatchResult
from app.services import listing_service
from app.services.matching.extractor import ClaudeExtractor, RequirementExtractor, RuleExtractor
from app.services.matching.scorer import score

CANDIDATE_LIMIT: int = 500
MIN_SCORE: float = 20.0


@lru_cache
def get_extractor() -> RequirementExtractor:
    """Claude when an API key is configured, rules otherwise (FastAPI dependency)."""
    settings = get_settings()
    if settings.anthropic_api_key:
        return ClaudeExtractor(settings.anthropic_api_key, settings.anthropic_model)
    return RuleExtractor()


async def match(
    session: AsyncSession, viewer: User, req: MatchRequest, extractor: RequirementExtractor
) -> MatchResponse:
    """Rank active listings (not the viewer's own) for a free-text requirement."""
    requirements, source = await extractor.extract(req.query)
    stmt = (
        select(Listing)
        .where(Listing.status == ListingStatus.ACTIVE, Listing.owner_id != viewer.id)
        .limit(CANDIDATE_LIMIT)
    )
    ranked: list[MatchResult] = []
    for listing in (await session.scalars(stmt)).unique():
        s = score(listing, requirements)
        if s.percent >= MIN_SCORE:
            ranked.append(MatchResult(listing=listing_service.to_out(listing, viewer), score=s.percent, reasons=s.reasons))
    ranked.sort(key=lambda r: r.score, reverse=True)
    return MatchResponse(requirements=requirements, parsed_by=source, results=ranked[: req.limit])

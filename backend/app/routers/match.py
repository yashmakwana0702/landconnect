"""AI-assisted buyer-to-parcel matching."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import CurrentUser, SessionDep
from app.schemas import MatchRequest, MatchResponse
from app.services import matching
from app.services.matching.extractor import RequirementExtractor

router = APIRouter(tags=["matching"])


@router.post("/match", response_model=MatchResponse)
async def match_parcels(
    data: MatchRequest,
    user: CurrentUser,
    session: SessionDep,
    extractor: Annotated[RequirementExtractor, Depends(matching.get_extractor)],
) -> MatchResponse:
    """Describe what you want in plain words; get ranked parcels with reasons."""
    return await matching.match(session, user, data, extractor)

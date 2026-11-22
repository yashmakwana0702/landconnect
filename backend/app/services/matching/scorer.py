"""Explainable parcel scoring: weighted price, area, location and feature fit.

Only dimensions the buyer actually specified are scored, and the result is
normalised to 0-100, so "near Hoskote" alone still ranks parcels sensibly.
"""

from dataclasses import dataclass, field

from app.models import Listing
from app.schemas import BuyerRequirements
from app.services.matching.gazetteer import haversine_km, lookup

WEIGHTS: dict[str, float] = {"price": 35.0, "area": 30.0, "location": 25.0, "features": 10.0}
NEAR_KM: float = 10.0
FAR_KM: float = 40.0
PRICE_TOLERANCE: float = 0.15  # up to 15% over budget still earns partial credit
LAKH: int = 100_000
CRORE: int = 10_000_000


@dataclass
class Score:
    """Accumulates weighted points and human-readable reasons."""

    earned: float = 0.0
    possible: float = 0.0
    reasons: list[str] = field(default_factory=list)

    def add(self, dimension: str, fraction: float, reason: str | None) -> None:
        """Credit `fraction` (0..1) of a dimension's weight."""
        weight = WEIGHTS[dimension]
        self.possible += weight
        self.earned += weight * max(0.0, min(1.0, fraction))
        if reason:
            self.reasons.append(reason)

    @property
    def percent(self) -> float:
        """Normalised 0-100 score (0 when nothing was specified)."""
        return round(100 * self.earned / self.possible, 1) if self.possible else 0.0


def fmt_inr(value: int) -> str:
    """Format rupees as lakh/crore, e.g. 25000000 -> '2.5 Cr'."""
    if value >= CRORE:
        return f"{value / CRORE:.2f}".rstrip("0").rstrip(".") + " Cr"
    return f"{value / LAKH:.1f}".rstrip("0").rstrip(".") + " L"


def _price(listing: Listing, req: BuyerRequirements, s: Score) -> None:
    lo, hi = req.budget_min_inr, req.budget_max_inr
    if lo is None and hi is None:
        return
    price = listing.price_inr
    if hi is not None and price > hi:
        over = (price - hi) / hi
        s.add("price", 1 - over / PRICE_TOLERANCE, None if over > PRICE_TOLERANCE else f"Slightly over budget ({fmt_inr(price)})")
    elif lo is not None and price < lo:
        s.add("price", 0.6, f"Below your range at {fmt_inr(price)}")
    else:
        s.add("price", 1.0, f"Within budget at {fmt_inr(price)}")


def _area(listing: Listing, req: BuyerRequirements, s: Score) -> None:
    lo, hi = req.area_min_acres, req.area_max_acres
    if lo is None and hi is None:
        return
    area = listing.area_acres
    if lo is not None and area < lo:
        s.add("area", area / lo - 0.3, f"Smaller than wanted ({area:g} acres)" if area / lo > 0.7 else None)
    elif hi is not None and area > hi:
        s.add("area", hi / area, f"Larger than wanted ({area:g} acres)")
    else:
        s.add("area", 1.0, f"{area:g} acres fits your size")


def _location(listing: Listing, req: BuyerRequirements, s: Score) -> None:
    if not req.locations:
        return
    haystack = f"{listing.locality} {listing.title}".lower()
    best, reason = 0.0, None
    for place in req.locations:
        if place.lower() in haystack:
            return s.add("location", 1.0, f"In {listing.locality}")
        centre = lookup(place)
        if centre is None:
            continue
        km = haversine_km(centre, (listing.latitude, listing.longitude))
        fraction = 1.0 if km <= NEAR_KM else max(0.0, 1 - (km - NEAR_KM) / (FAR_KM - NEAR_KM))
        if fraction > best:
            best, reason = fraction, f"~{km:.0f} km from {place.title()}"
    s.add("location", best, reason if best > 0 else None)


def _features(listing: Listing, req: BuyerRequirements, s: Score) -> None:
    if not req.must_haves:
        return
    text = f"{listing.title} {listing.description}".lower()
    hits = [f for f in req.must_haves if f.lower() in text]
    s.add("features", len(hits) / len(req.must_haves), f"Mentions {', '.join(hits)}" if hits else None)


def score(listing: Listing, req: BuyerRequirements) -> Score:
    """Score one listing against the requirements."""
    s = Score()
    for part in (_price, _area, _location, _features):
        part(listing, req, s)
    return s

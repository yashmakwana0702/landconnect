"""Buyer requirement parsing and parcel ranking (no LLM calls)."""

import httpx
import pytest

from app.schemas import BuyerRequirements
from app.services.matching.extractor import RuleExtractor
from tests.conftest import SAMPLE_LISTING, make_user


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("5-10 acres near Hoskote under 3 crore with road access",
         {"area_min_acres": 5, "area_max_acres": 10, "budget_max_inr": 30_000_000, "locations": ["Hoskote"], "must_haves": ["road access"]}),
        ("at least 2 acres in Bidadi, budget 80 lakh", {"area_min_acres": 2, "budget_max_inr": 8_000_000, "locations": ["Bidadi"]}),
        ("1.5 to 2 cr farmland kolar", {"budget_min_inr": 15_000_000, "budget_max_inr": 20_000_000, "must_haves": ["farmland"]}),
    ],
)
async def test_rule_extractor(query: str, expected: dict[str, object]) -> None:
    req, source = await RuleExtractor().extract(query)
    assert source == "rules"
    for key, value in expected.items():
        assert getattr(req, key) == value, key


class FakeExtractor:
    """Stands in for Claude in endpoint tests."""

    async def extract(self, query: str) -> tuple[BuyerRequirements, str]:
        return BuyerRequirements(budget_max_inr=30_000_000, area_min_acres=4, locations=["Hoskote"]), "llm"


async def test_match_endpoint_ranks_nearby_parcel_first(client: httpx.AsyncClient) -> None:
    from app.main import app
    from app.services import matching

    seller = await make_user(client, "seller", "Mohan")
    buyer = await make_user(client, "buyer", "Nisha")
    await client.post("/listings", json=SAMPLE_LISTING, headers=seller.headers)  # Hoskote, 2.5 Cr, 5 ac
    await client.post(
        "/listings",
        json={**SAMPLE_LISTING, "title": "Kanakapura plot", "locality": "Kanakapura", "latitude": 12.546, "longitude": 77.419, "price_inr": 90_000_000},
        headers=seller.headers,
    )
    app.dependency_overrides[matching.get_extractor] = FakeExtractor
    try:
        resp = await client.post("/match", json={"query": "4+ acres near Hoskote under 3 Cr"}, headers=buyer.headers)
    finally:
        app.dependency_overrides.clear()
    body = resp.json()
    assert resp.status_code == 200 and body["parsed_by"] == "llm"
    assert body["results"][0]["listing"]["locality"] == "Hoskote"
    assert body["results"][0]["score"] == 100.0
    assert any("Within budget" in r for r in body["results"][0]["reasons"])
    assert all(r["listing"]["locality"] != "Kanakapura" or r["score"] < 50 for r in body["results"])

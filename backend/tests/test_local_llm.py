"""Smoke tests for LocalLLMExtractor (no real network)."""

import httpx
import pytest

from app.services.matching import extractor as ext

REAL_CLIENT = httpx.AsyncClient


def _patch_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    monkeypatch.setattr(
        ext.httpx, "AsyncClient", lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(handler), **kw)
    )


@pytest.mark.asyncio
async def test_local_llm_parses_json(monkeypatch: pytest.MonkeyPatch) -> None:
    body = {"choices": [{"message": {"content": '{"budget_max_inr": 20000000, "locations": ["Hosur"]}'}}]}
    _patch_transport(monkeypatch, lambda req: httpx.Response(200, json=body))
    req, source = await ext.LocalLLMExtractor("http://llm/v1", "m").extract("x")
    assert source == "llm" and req.budget_max_inr == 20_000_000 and req.locations == ["Hosur"]


@pytest.mark.asyncio
async def test_local_llm_repairs_budget_and_must_haves(monkeypatch: pytest.MonkeyPatch) -> None:
    content = '{"locations": ["Hosur"], "must_haves": ["road access", "clear title"]}'
    _patch_transport(monkeypatch, lambda req: httpx.Response(200, json={"choices": [{"message": {"content": content}}]}))
    req, _ = await ext.LocalLLMExtractor("http://llm/v1", "m").extract("5 acres near Hosur under 2 crore with road access")
    assert req.budget_max_inr == 20_000_000 and req.must_haves == ["road access"]


@pytest.mark.asyncio
async def test_local_llm_falls_back_to_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_transport(monkeypatch, lambda req: httpx.Response(500))
    _, source = await ext.LocalLLMExtractor("http://llm/v1", "m").extract("under 2 crore")
    assert source == "rules"

"""Turn a buyer's free-text requirement into structured `BuyerRequirements`.

`ClaudeExtractor` uses structured outputs when ANTHROPIC_API_KEY is set; otherwise
(or if the call fails) `RuleExtractor` parses lakh/crore budgets, acreage,
known localities and common must-haves with regexes.
"""

import logging
import re
from typing import Literal, Protocol

import httpx
from anthropic import AsyncAnthropic

from app.schemas import BuyerRequirements
from app.services.matching.gazetteer import LOCALITIES

logger = logging.getLogger(__name__)

LAKH: int = 100_000
CRORE: int = 10_000_000
FEATURE_KEYWORDS: tuple[str, ...] = (
    "road access", "highway", "water", "borewell", "electricity", "clear title",
    "fenced", "farmland", "agricultural", "residential", "industrial", "commercial",
    "gated", "plain", "irrigation", "corner",
)
SYSTEM_PROMPT: str = (
    "You convert an Indian land buyer's requirement into structured search filters. "
    "Money is in INR: 1 lakh = 100000, 1 crore = 10000000. Area is in acres "
    "(1 acre = 43560 sq ft; 1 acre = 40 guntas). 'Under X' sets only budget_max_inr. "
    "locations are place names as written (towns, highways, areas). must_haves are short "
    "lowercase phrases for physical or legal features the buyer insists on "
    "(e.g. 'road access', 'clear title', 'water'). Leave a field null or empty when "
    "the text does not say it; never invent values."
)

Source = Literal["llm", "rules"]


class RequirementExtractor(Protocol):
    """Anything that can parse a requirement string."""

    async def extract(self, query: str) -> tuple[BuyerRequirements, Source]:
        """Return requirements and which parser produced them."""
        ...


_MONEY = re.compile(r"(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l)\b", re.I)
_MONEY_RANGE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|l)\b", re.I)
_AREA_RANGE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*acres?", re.I)
_AREA = re.compile(r"(\d+(?:\.\d+)?)\s*acres?", re.I)
_MIN_WORDS = re.compile(r"\b(at least|min(?:imum)?|more than|above|over)\s*$", re.I)
_MAX_WORDS = re.compile(r"\b(under|below|less than|max(?:imum)?|upto|up to|within)\s*$", re.I)


def _to_inr(amount: str, unit: str) -> int:
    return int(float(amount) * (CRORE if unit.lower().startswith("c") else LAKH))


def _parse_budget(text: str, req: BuyerRequirements) -> None:
    if m := _MONEY_RANGE.search(text):
        req.budget_min_inr, req.budget_max_inr = _to_inr(m[1], m[3]), _to_inr(m[2], m[3])
        return
    if m := _MONEY.search(text):
        value = _to_inr(m[1], m[2])
        if _MIN_WORDS.search(text[: m.start()]):
            req.budget_min_inr = value
        else:  # "under 2 cr", "budget 2 cr" and a bare "2 cr" all read as a ceiling
            req.budget_max_inr = value


def _parse_area(text: str, req: BuyerRequirements) -> None:
    if m := _AREA_RANGE.search(text):
        req.area_min_acres, req.area_max_acres = float(m[1]), float(m[2])
        return
    if m := _AREA.search(text):
        value = float(m[1])
        prefix = text[: m.start()]
        if _MAX_WORDS.search(prefix):
            req.area_max_acres = value
        elif _MIN_WORDS.search(prefix):
            req.area_min_acres = value
        else:  # a bare "5 acres" means roughly that size
            req.area_min_acres, req.area_max_acres = value * 0.8, value * 1.25


class RuleExtractor:
    """Deterministic regex/keyword parser (offline fallback)."""

    async def extract(self, query: str) -> tuple[BuyerRequirements, Source]:
        """Parse budget, area, localities and features from `query`."""
        text = query.lower()
        req = BuyerRequirements()
        _parse_budget(text, req)
        _parse_area(text, req)
        req.locations = [name.title() for name in LOCALITIES if name in text]
        req.must_haves = [kw for kw in FEATURE_KEYWORDS if kw in text]
        return req, "rules"


class LocalLLMExtractor:
    """LLM parser for an OpenAI-compatible server (llama-swap), falling back to rules."""

    def __init__(self, base_url: str, model: str, fallback: RequirementExtractor | None = None) -> None:
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._fallback = fallback or RuleExtractor()

    async def extract(self, query: str) -> tuple[BuyerRequirements, Source]:
        """Ask the local model for JSON matching `BuyerRequirements`; degrade gracefully."""
        payload = {
            "model": self._model,
            "temperature": 0,
            "max_tokens": 1000,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "BuyerRequirements", "schema": BuyerRequirements.model_json_schema()},
            },
        }
        try:
            # Generous timeout: llama-swap may need to load the model on first call.
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(self._url, json=payload)
                resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            req = BuyerRequirements.model_validate_json(content)
            return await self._repair(query, req), "llm"
        except Exception:  # noqa: BLE001 - matching must still work without the LLM
            logger.warning("Local LLM requirement extraction failed; using rules", exc_info=True)
            return await self._fallback.extract(query)


    async def _repair(self, query: str, req: BuyerRequirements) -> BuyerRequirements:
        """Fix common small-model errors: missing numbers and invented must-haves."""
        rules, _ = await RuleExtractor().extract(query)
        for field in ("budget_min_inr", "budget_max_inr", "area_min_acres", "area_max_acres"):
            if getattr(req, field) is None:
                setattr(req, field, getattr(rules, field))
        text = query.lower()
        req.must_haves = [m for m in req.must_haves if any(w in text for w in m.lower().split())]
        return req


class ClaudeExtractor:
    """LLM parser using Claude structured outputs, falling back to rules on any error."""

    def __init__(self, api_key: str, model: str, fallback: RequirementExtractor | None = None) -> None:
        self._client = AsyncAnthropic(api_key=api_key, timeout=20.0, max_retries=1)
        self._model = model
        self._fallback = fallback or RuleExtractor()

    async def extract(self, query: str) -> tuple[BuyerRequirements, Source]:
        """Ask Claude for a `BuyerRequirements` object; degrade gracefully."""
        try:
            response = await self._client.beta.messages.parse(
                model=self._model,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": query}],
                output_format=BuyerRequirements,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
            if response.stop_reason == "refusal" or response.parsed_output is None:
                raise ValueError(f"no structured output (stop_reason={response.stop_reason})")
            return response.parsed_output, "llm"
        except Exception:  # noqa: BLE001 - matching must still work without the LLM
            logger.warning("LLM requirement extraction failed; using rules", exc_info=True)
            return await self._fallback.extract(query)

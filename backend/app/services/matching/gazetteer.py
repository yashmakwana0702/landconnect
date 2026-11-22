"""Approximate centroids of localities around Bengaluru used for proximity matching."""

import math

LOCALITIES: dict[str, tuple[float, float]] = {
    "hoskote": (13.0707, 77.7982),
    "bidadi": (12.7975, 77.3866),
    "kolar": (13.1367, 78.1292),
    "devanahalli": (13.2473, 77.7120),
    "doddaballapur": (13.2957, 77.5373),
    "nelamangala": (13.0977, 77.3936),
    "kanakapura": (12.5462, 77.4198),
    "ramanagara": (12.7209, 77.2799),
    "anekal": (12.7105, 77.6970),
    "sarjapur": (12.8600, 77.7862),
    "whitefield": (12.9698, 77.7500),
    "malur": (13.0037, 77.9383),
    "chikkaballapur": (13.4355, 77.7315),
    "hosur": (12.7409, 77.8253),
    "magadi": (12.9576, 77.2244),
    "tumkur": (13.3392, 77.1017),
    "electronic city": (12.8452, 77.6602),
    "yelahanka": (13.1007, 77.5963),
}

EARTH_RADIUS_KM: float = 6371.0


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two (lat, lng) points in km."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def lookup(name: str) -> tuple[float, float] | None:
    """Centroid for a locality name (case-insensitive, tolerant of extra words)."""
    key = name.strip().lower()
    if key in LOCALITIES:
        return LOCALITIES[key]
    return next((coords for loc, coords in LOCALITIES.items() if loc in key), None)

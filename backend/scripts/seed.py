"""Seed demo accounts and listings. Run: python -m scripts.seed (from backend/)."""

import asyncio
import logging

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Listing, Role, User
from app.security import hash_password

logger = logging.getLogger("seed")
DEMO_PASSWORD: str = "demo1234"
USERS: list[tuple[str, str, Role]] = [
    ("buyer@demo.in", "Ananya (Buyer)", Role.BUYER),
    ("seller@demo.in", "Ramesh (Seller)", Role.SELLER),
    ("broker@demo.in", "Kavya (Broker)", Role.BROKER),
]
# (owner email, title, locality, lat, lng, acres, price INR, description, hide pin)
LISTINGS: list[tuple[str, str, str, float, float, float, int, str, bool]] = [
    ("seller@demo.in", "5 acre farmland off NH-75", "Hoskote", 13.0842, 77.8105, 5, 32_500_000,
     "Fertile red soil, borewell water, clear title, 40 ft road access. 3 km from the highway.", False),
    ("seller@demo.in", "2 acre plot near Bidadi township", "Bidadi", 12.8031, 77.3952, 2, 14_000_000,
     "Plain land, fenced, electricity available. Good for a farmhouse.", True),
    ("broker@demo.in", "12 acre industrial-zoned parcel", "Kolar", 13.1502, 78.1105, 12, 66_000_000,
     "Industrial zone near the Bengaluru-Chennai expressway. Clear title, corner plot.", False),
    ("broker@demo.in", "1 acre residential plot, Devanahalli", "Devanahalli", 13.2380, 77.7051, 1, 21_000_000,
     "Close to the airport. Residential conversion done, road access, water connection.", False),
    ("seller@demo.in", "8 acre mango orchard", "Malur", 13.0122, 77.9450, 8, 28_000_000,
     "Mature mango trees, irrigation channel, farmland with clear title.", True),
    ("broker@demo.in", "3.5 acre plot on Kanakapura Road", "Kanakapura", 12.5800, 77.4300, 3.5, 17_500_000,
     "Gated layout, plain land, electricity, 30 ft road.", False),
    ("broker@demo.in", "20 acre land bank, BLR-Hyderabad highway", "Chikkaballapur", 13.4220, 77.7120, 20, 90_000_000,
     "Highway frontage, agricultural, ideal for a logistics park. Borewell water.", True),
]


async def seed() -> None:
    """Insert demo data if it is not already there."""
    async with SessionLocal() as session:
        if await session.scalar(select(User).where(User.email == USERS[0][0])):
            logger.info("demo data already present - nothing to do")
            return
        users = {email: User(email=email, password_hash=hash_password(DEMO_PASSWORD), display_name=name, role=role)
                 for email, name, role in USERS}
        session.add_all(users.values())
        await session.flush()
        for owner, title, locality, lat, lng, acres, price, desc, hide in LISTINGS:
            session.add(Listing(owner_id=users[owner].id, title=title, locality=locality, latitude=lat, longitude=lng,
                                area_acres=acres, price_inr=price, description=desc, hide_exact_location=hide))
        await session.commit()
        logger.info("seeded %d users (password %r) and %d listings", len(users), DEMO_PASSWORD, len(LISTINGS))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())

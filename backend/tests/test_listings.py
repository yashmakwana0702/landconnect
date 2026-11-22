"""Listings CRUD, role-based permissions, images and location privacy."""

import httpx

from tests.conftest import SAMPLE_LISTING, make_user

PNG_1PX: bytes = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


async def test_buyer_cannot_create_listing(client: httpx.AsyncClient) -> None:
    buyer = await make_user(client, "buyer", "Bea")
    resp = await client.post("/listings", json=SAMPLE_LISTING, headers=buyer.headers)
    assert resp.status_code == 403


async def test_seller_and_broker_crud(client: httpx.AsyncClient) -> None:
    broker = await make_user(client, "broker", "Bharat")
    other = await make_user(client, "seller", "Olga")
    created = await client.post("/listings", json=SAMPLE_LISTING, headers=broker.headers)
    assert created.status_code == 201
    listing = created.json()
    assert listing["is_mine"] is True and listing["owner"]["role"] == "broker"

    forbidden = await client.patch(f"/listings/{listing['id']}", json={"price_inr": 1}, headers=other.headers)
    assert forbidden.status_code == 403

    updated = await client.patch(
        f"/listings/{listing['id']}", json={"price_inr": 20_000_000, "status": "sold"}, headers=broker.headers
    )
    assert updated.json()["price_inr"] == 20_000_000
    feed = (await client.get("/listings", headers=other.headers)).json()
    assert feed == []  # sold listings leave the community feed
    mine = (await client.get("/listings?mine=true", headers=broker.headers)).json()
    assert len(mine) == 1

    assert (await client.delete(f"/listings/{listing['id']}", headers=broker.headers)).status_code == 204
    assert (await client.get(f"/listings/{listing['id']}", headers=broker.headers)).status_code == 404


async def test_filters(client: httpx.AsyncClient) -> None:
    seller = await make_user(client, "seller", "Suma")
    await client.post("/listings", json=SAMPLE_LISTING, headers=seller.headers)
    await client.post(
        "/listings", json={**SAMPLE_LISTING, "title": "Bidadi farm", "locality": "Bidadi", "area_acres": 12}, headers=seller.headers
    )
    by_q = (await client.get("/listings?q=bidadi", headers=seller.headers)).json()
    assert [x["locality"] for x in by_q] == ["Bidadi"]
    by_area = (await client.get("/listings?min_area=10", headers=seller.headers)).json()
    assert len(by_area) == 1


async def test_image_upload_and_delete(client: httpx.AsyncClient) -> None:
    seller = await make_user(client, "seller", "Imran")
    listing = (await client.post("/listings", json=SAMPLE_LISTING, headers=seller.headers)).json()
    files = [("files", ("a.png", PNG_1PX, "image/png")), ("files", ("b.png", PNG_1PX, "image/png"))]
    resp = await client.post(f"/listings/{listing['id']}/images", files=files, headers=seller.headers)
    assert resp.status_code == 200, resp.text
    images = resp.json()["images"]
    assert len(images) == 2 and images[0]["url"].startswith("/uploads/")
    assert (await client.get(images[0]["url"])).status_code == 200

    bad = await client.post(
        f"/listings/{listing['id']}/images", files=[("files", ("x.txt", b"hi", "text/plain"))], headers=seller.headers
    )
    assert bad.status_code == 400

    after = await client.delete(f"/listings/{listing['id']}/images/{images[0]['id']}", headers=seller.headers)
    assert len(after.json()["images"]) == 1


async def test_hidden_location_is_blurred_for_others(client: httpx.AsyncClient) -> None:
    seller = await make_user(client, "seller", "Priya")
    buyer = await make_user(client, "buyer", "Ravi")
    listing = (
        await client.post("/listings", json={**SAMPLE_LISTING, "hide_exact_location": True}, headers=seller.headers)
    ).json()
    assert listing["latitude"] == SAMPLE_LISTING["latitude"]  # owner sees the exact pin

    seen = (await client.get(f"/listings/{listing['id']}", headers=buyer.headers)).json()
    assert seen["location_is_approximate"] is True
    assert seen["latitude"] == round(SAMPLE_LISTING["latitude"], 2)

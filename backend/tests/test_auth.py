"""Auth, roles and contact-detail privacy."""

import httpx

from tests.conftest import SAMPLE_LISTING, make_user


async def test_register_login_me(client: httpx.AsyncClient) -> None:
    alice = await make_user(client, "buyer", "Alice", phone="+919999999999")
    me = await client.get("/me", headers=alice.headers)
    assert me.status_code == 200
    assert me.json()["role"] == "buyer"
    assert me.json()["phone"] == "+919999999999"

    login = await client.post("/auth/login", json={"email": "ALICE@example.com", "password": "password123"})
    assert login.status_code == 200


async def test_duplicate_email_and_bad_password(client: httpx.AsyncClient) -> None:
    await make_user(client, "seller", "Sam")
    dup = await client.post(
        "/auth/register",
        json={"email": "sam@example.com", "password": "password123", "display_name": "Sam2", "role": "buyer"},
    )
    assert dup.status_code == 409
    bad = await client.post("/auth/login", json={"email": "sam@example.com", "password": "wrongpass1"})
    assert bad.status_code == 401


async def test_requires_token(client: httpx.AsyncClient) -> None:
    assert (await client.get("/me")).status_code == 401
    assert (await client.get("/me", headers={"Authorization": "Bearer nope"})).status_code == 401


async def test_phone_and_email_never_exposed_to_others(client: httpx.AsyncClient) -> None:
    seller = await make_user(client, "seller", "Sita", phone="+918888888888")
    buyer = await make_user(client, "buyer", "Bala")
    await client.post("/listings", json=SAMPLE_LISTING, headers=seller.headers)

    users = (await client.get("/users", headers=buyer.headers)).text
    listings = (await client.get("/listings", headers=buyer.headers)).text
    for payload in (users, listings):
        assert "8888888888" not in payload
        assert "sita@example.com" not in payload

# LandConnect: land marketplace prototype

A WhatsApp-style mobile app where buyers, sellers and brokers find land, chat, and make **in-app audio and video calls without ever sharing phone numbers**.

| | |
|---|---|
| Mobile | Expo SDK 58 (React Native 0.88, TypeScript), Expo Router, LiveKit React Native SDK |
| Backend | FastAPI (async), SQLAlchemy 2 + PostgreSQL, Alembic, JWT auth |
| Calls | LiveKit (managed WebRTC SFU) for media; FastAPI WebSocket for ringing/accept/reject/end |
| Maps | Leaflet + OpenStreetMap/CARTO tiles in a WebView (no Google Maps key needed) |
| AI extra | Free-text buyer requirement → structured filters (self-hosted Qwen2.5-7B via llama-swap, or Claude; rule-based fallback) → ranked parcels with reasons |

**Live demo:** API at https://demo.warlord0702.xyz (interactive docs at `/docs`). Install the APK, then sign in with a demo account: `buyer@demo.in`, `seller@demo.in` or `broker@demo.in`, password `demo1234`.

Docs: [Architecture and decisions](docs/ARCHITECTURE.md) · [AI tools usage](docs/AI_USAGE.md) · [Demo video script](docs/DEMO_SCRIPT.md)

## Features

- **Auth and roles**: register/login (bcrypt + JWT), Buyer / Seller / Broker. Only sellers and brokers can create listings, and only the owner can edit or delete one (enforced server-side).
- **Community feed**: listings with photos, price (₹ lakh/crore), acreage, locality; search and filters.
- **Listing management**: create/edit/delete, multi-photo upload, mark as sold, map pin by tap, drag or "use my location".
- **Maps**: all parcels on a map with price tags; tap to preview.
- **Messaging**: 1:1 chats (optionally tied to a listing) and group chats, delivered live over WebSocket.
- **Meeting rooms**: every group chat has a join-anytime video room.
- **Calls (key requirement)**: start a voice or video call from a chat, listing or the Calls tab. The callee gets a full-screen ringing screen and can accept or decline. Either side can hang up; unanswered calls become *missed* after 35 s; a busy callee gets a busy error. In-call controls: mute, camera on/off, flip camera, speaker. Every call is logged in the chat and the Calls tab.
- **Privacy**:
  - Phone and email are never returned to other users: public profiles are name + role only.
  - LiveKit identities are opaque user IDs.
  - An "accept in-app calls" switch lets a user stop all incoming calls.
  - Owners can hide a parcel's exact pin: others see a ~1 km approximate area.
- **AI land match**: "5–10 acres near Hoskote under 3.5 crore with road access" returns ranked parcels with an explainable score.

## Quick start (local)

Prerequisites: Docker Desktop, Node 20+, Python 3.13 (conda), an Android phone, and a free [LiveKit Cloud](https://cloud.livekit.io) project.

### 1. Backend

```powershell
Copy-Item backend/.env.example backend/.env    # then fill in LIVEKIT_URL / KEY / SECRET and JWT_SECRET
docker compose up -d --build                    # Postgres + API on :8000 (runs migrations)
docker compose exec api python -m scripts.seed  # demo users + 7 listings around Bengaluru
```

Open http://localhost:8000/docs for the interactive API docs.

<details><summary>Run the API without Docker (for development)</summary>

```powershell
conda create -n landconnect python=3.13 -y
conda activate landconnect
pip install -r backend/requirements-dev.txt
docker compose up -d db
cd backend
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pytest -q          # 26 tests, SQLite, no network
```
</details>

Demo accounts (password `demo1234`): `buyer@demo.in`, `seller@demo.in`, `broker@demo.in`. The sign-in screen has one-tap buttons for them.

### 2. Mobile app

LiveKit uses native WebRTC, so the app runs as a **development build** or **APK**, not in Expo Go.

```powershell
cd mobile
npm ci
Copy-Item .env.example .env    # set EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:8000
```

Pick one way to run it:

- **Development build (cloud, no Android Studio):**
  ```powershell
  npx eas-cli@latest login
  npx eas-cli@latest build -p android --profile development   # install the APK it prints
  npx expo start --dev-client                                 # phone and PC on the same Wi-Fi
  ```
- **Standalone APK** (what reviewers install): set `EXPO_PUBLIC_API_URL` in `mobile/eas.json` (`build.preview.env`) to a public backend URL (see below), then:
  ```powershell
  npx eas-cli@latest build -p android --profile preview
  ```
- **Local build** (requires Android Studio + JDK 17): `npx expo run:android`.

### 3. Try a call

Install the app on **two phones** (or a phone and an emulator) and sign in as `buyer@demo.in` on one and `seller@demo.in` on the other.

1. On the buyer's phone, open a listing, then tap **Video call**. The seller's phone rings.
2. On the seller's phone, tap **Accept** or **Decline**.
3. Hang up from either side.

## Making the demo reachable from anywhere

The APK talks to the API URL baked in at build time, and to the LiveKit URL the API returns.

- **LiveKit**: use LiveKit Cloud. It provides TURN and TLS, so calls work across mobile networks.
- **API**: deploy `backend/` (it has a Dockerfile that honours `$PORT` and runs migrations) to Render, Railway or Fly with a managed Postgres. Set the same env vars as `.env.example`.
- **How the live demo is hosted**: the same `docker-compose.yml` (API + Postgres) runs on a home server behind nginx and a Cloudflare tunnel at `demo.warlord0702.xyz`, with LiveKit Cloud for media.
- **AI matching model**: set `LLM_BASE_URL` (OpenAI-compatible, e.g. llama-swap `.../v1`) and `LLM_MODEL` to use a self-hosted model; otherwise set `ANTHROPIC_API_KEY` for Claude. With neither, the rule-based parser is used. Priority: local LLM, then Claude, then rules.
- **Quick alternative for a live demo**: `cloudflared tunnel --url http://localhost:8000` gives an HTTPS URL to put in `eas.json`.

## Project layout

```
backend/
  app/
    main.py            app factory, error mapping, static /uploads
    config.py db.py models.py schemas.py security.py deps.py errors.py
    routers/           thin HTTP/WebSocket endpoints (auth, listings, chat, calls, match, ws)
    services/          business logic: call_service (state machine), chat_service,
                       listing_service, storage, realtime (WS fan-out), livekit_tokens,
                       matching/ (extractor, scorer, gazetteer)
  migrations/          Alembic (async)
  scripts/seed.py      demo data
  tests/               pytest + pytest-asyncio (SQLite, fake event bus, no network)
mobile/
  src/app/             Expo Router screens: (tabs)/ community, map, chats, calls, profile;
                       listing/, chat/, call/ (incoming + in-call), meeting/, match, sign-in, register
  src/components/      CallRoom (LiveKit UI), LeafletMap, ListingCard, ui primitives
  src/lib/             api client, auth context, realtime WebSocket, callStore, formatting
docker-compose.yml     db + api (+ optional self-hosted LiveKit profile)
```

## Known limitations (prototype scope)

- **Incoming calls ring while the app is open.** Ringing a locked or killed phone needs push notifications (FCM data messages, plus CallKit/ConnectionService for a native call UI). That is the first thing I would add next; see the architecture doc.
- Realtime fan-out is in-process (single API instance). Scaling out needs Redis pub/sub.
- Images are stored on local disk; production would use S3/GCS with signed URLs.
- Access tokens last 7 days with no refresh-token rotation.
- iOS is configured (permissions, background audio) but was not built or tested; the demo targets Android.

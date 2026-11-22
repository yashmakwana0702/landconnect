# Demo video script (about 2.5 min)

Setup: two Android phones (A = buyer, B = seller), both with the APK, same backend, LiveKit Cloud. Record both screens: phone screen recording on each, or a webcam pointed at both. Before recording, run `docker compose exec api python -m scripts.seed` and upload a photo or two to one listing so the feed looks real.

| Time | Phone | Action | Say |
|---|---|---|---|
| 0:00 | A | Sign-in screen → tap **Buyer** demo → Sign in | "LandConnect: buyers, sellers and brokers. Three roles, enforced on the server." |
| 0:10 | A | Scroll the Community feed; open the **Map** tab, tap a price tag | "Listings with photos, price in lakh/crore, acreage. Parcels on a map. Some owners hide the exact pin; you see an approximate area." |
| 0:25 | B | Signed in as **Seller** → tap **+** → add photos, price "2.5 cr", drop the pin → Publish | "Sellers and brokers create listings with images and a map location. Buyers can't." |
| 0:45 | A | Open that listing → **Chat with owner** → send "Is this available?" | B shows the message instantly. "In-app chat. No phone number is ever shown." |
| 1:00 | A | Tap the **video** icon in the chat header | B shows the **full-screen incoming call**. "Initiate…" |
| 1:05 | B | Tap **Decline** | A shows "Call declined"; a log line appears in the chat. "…and reject." |
| 1:15 | A | Tap **video** again → B taps **Accept** | Both connect. "Accept: live video through LiveKit." |
| 1:25 | both | Toggle mute, camera off/on, flip camera, speaker | "Mute, camera, switch camera, speaker." |
| 1:40 | A | Tap the red **end** button | B returns to the chat; "Video call · 0:20" is logged. "End: both sides close." |
| 1:50 | A | Tap **voice call** → B lets it ring out | "Unanswered calls become missed after 35 seconds." (Or cut and show the Calls tab with the missed call.) |
| 2:05 | B | Profile → turn off **Accept in-app calls** → A tries to call | A sees "not accepting calls". "Privacy control." |
| 2:15 | A | Community → **Find land with AI** → tap an example | "AI matching: plain-language requirements become filters, and parcels are ranked with reasons." |
| 2:30 | — | Optional: show a group chat → **Join meeting room** | "Group meeting rooms for buyer, seller and broker." |

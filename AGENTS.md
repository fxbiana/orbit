# Ticket Trapper

Chrome extension that saves the active tab as a ticket. The popup is React. The API is Flask. Clerk signs the user in. Firestore stores tickets and onboarding profiles.

## Product decisions (locked)

These decisions are locked for planning and implementation. Change them only with an explicit product decision, not casually in a feature PR. Schema paths, additive collections, and workflows for the next layers: [`docs/SCHEMA_AND_WORKFLOW.md`](docs/SCHEMA_AND_WORKFLOW.md).

### North star and horizons

- **North star:** Help people find others to go with — preference compatibility, shared event intent, then a consented connection.
- **Now (v1 engine):** The website owns onboarding and preference matching (`knows` ↔ `wants_to_learn`, plus location, age, gathering size). Ship real peer matches from Firestore profiles before event social features.
- **Next:** Canonical events + per-user attendance (`interested` / `going`). Filter or boost matches by shared event intent. Ticketmaster (or similar) fills the same event shape; seeded/manual events are enough until then.
- **Then:** Extension as capture + prompt on event/ticket pages. Friend/connect request among compatible users (especially mutual event interest).
- **Later only:** Purchase-page heuristics (“looks like you bought tickets”) as an optional prompt. Manual attendance remains the source of truth.

### Ownership

- **Website = product brain.** Profiles, matches, events, attendance, and connections are created and viewed on the site via the Flask API.
- **Extension = capture + prompt.** It may detect a relevant tab, save a ticket, suggest linking an event, and ask “find people?” It does not own search, matching, notifications fan-out, or the social graph.
- **Rule:** Anything the extension collects must be writable through the same API the website could call alone. The extension does not talk to Firestore.

### Data model (extend, do not rewrite)

| Keep intact | Add beside it when needed |
| --- | --- |
| `users/{userId}/profile/onboarding` | Optional `users/{userId}/profile/spotify` snapshot (no OAuth tokens) |
| `users/{userId}/tickets/{ticketId}` (`title`, `url`, `status`, `created_at`) | Global `events/{eventId}`; optional `event_id` on a ticket when a capture links to an event |
| Compatibility on the five topics | `users/{userId}/attendance/{eventId}` with `interested` / `going` |
| No friend graph in onboarding | Separate connection/request documents (consent edge ≠ match score) |

- **Tickets ≠ attendance.** A ticket is a saved page (title + URL). “I’m going” is attendance on an event.
- **Match ≠ friend.** Scoring stays preference-based. Connecting is an explicit request/accept edge.
- Do not replace onboarding topics with a social graph. Do not overload `tickets` to mean Ticketmaster events.

### Matching and privacy

- Match lists show compatibility score and limited profile fields needed to judge a fit (name, location, age band/gathering, match reasons).
- **Connect** is request → accept. Treat deeper contact or messaging as gated on accept once that surface exists.
- Current sample-people demo may keep showing scores as today; real-user matching follows the same visibility rules.

### Events and Ticketmaster

- Introduce a shared **Event** entity (id, title, venue/city, start time, optional external id/url) before wiring Ticketmaster.
- Ticketmaster is an ingestion source for that shape, not a parallel data model.
- First event UX lives on the website (search or seeded list by `profile.location`). Extension tab detection comes after attendance APIs exist.

### Spotify (when built)

- Optional personalization only. Clerk Spotify external account + Flask import using the user’s OAuth token from Clerk.
- Map normalized genres into existing `interests.knows` / `interests.wants_to_learn` (no new topic key). User confirms suggested chips before save.
- Do not depend on Spotify audio features, recommendations, or related-artists APIs (unavailable to new apps).

## Layout

- `extension/` Manifest V3 popup. Vite, React, CRXJS, `@clerk/chrome-extension`.
- `backend/` Flask application factory. Run it from this directory.
- `.env.example` API and Clerk settings. Copy to `.env` at the repo root.
- `extension/.env.example` Vite settings. Copy to `extension/.env`.

The unpacked extension id is `gpnknnpdogpdgeejedabdihnacblhmmj`. The public key in `extension/manifest.config.ts` pins that id. `CORS_ORIGINS` must include `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj`.

## Who owns what

Clerk owns identity and sessions. The popup calls `getToken()` and sends `Authorization: Bearer`. `caller_required` in `backend/app/auth.py` verifies that token when `AUTH_MODE=clerk` and sets `g.user_id` to the Clerk user id. Read the caller from `g.user_id`. A user id in the JSON body is not the caller. `AUTH_MODE=local` still accepts `X-User-Id` for tests.

Firestore is the only store, in development and in production. This hackathon uses one Firebase project for both. There is no emulator and no second database. Tickets live at `users/{userId}/tickets/{ticketId}`. Onboarding profiles live at `users/{userId}/profile/onboarding`. The API reads and writes those paths with the Firebase Admin SDK. The extension does not talk to Firestore.

`FIREBASE_CREDENTIALS_PATH` must point at the service account JSON for any route that reads or writes tickets, and for `GET /ready`. `GET /health` answers with no credentials file.

## Run

API, from `backend/` after the root `.env` exists:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app wsgi run --debug --port 5000
```

`/health` answers without Firebase. `/ready` initializes Firebase Admin and reads Firestore. Ticket and onboarding routes need `FIREBASE_CREDENTIALS_PATH`. Signed-in routes need `CLERK_SECRET_KEY` while `AUTH_MODE=clerk`.

Website, from `web/` after `web/.env` exists:

```bash
cd web
npm install
npm run dev
```

The site runs at `http://localhost:5174`. That origin has to be in `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES`.

Docker, from the repo root, after the env files exist and `FIREBASE_CREDENTIALS_PATH` is set:

```bash
docker compose up --build
```

The API container runs `flask --debug` on port 5000. The website container runs Vite on port 5174. `docker compose exec api python seed_profiles.py` writes the sample profiles. `docker compose exec api pytest` runs the API tests.

## Routes

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | public |
| GET | `/ready` | public, needs Firebase credentials and Firestore |
| GET | `/api/me` | Clerk session |
| GET | `/api/onboarding` | Clerk session |
| PUT | `/api/onboarding` | Clerk session, JSON onboarding profile |
| GET | `/api/tickets` | Clerk session |
| POST | `/api/tickets` | Clerk session, JSON `{ "title", "url" }` |

Decorator order on a view is `@bp.get`, `@bp.post`, or `@bp.put`, then `@caller_required`. New routes go on a blueprint under `backend/app/routes/` and return JSON.

## Tickets

Each ticket document stores `title`, `url`, `status`, and `created_at`. `status` defaults to `open`. `title` max length is 500. `url` max length is 2000. The API returns `{id, title, url, status, created_at}`. `GET /api/tickets` returns that user's tickets, newest first. A user id with no tickets returns an empty list and does not write a user document.

Do not add Postgres, a second database, or SQLite.

## Onboarding

A user has one profile at `users/{userId}/profile/onboarding`. `PUT /api/onboarding` creates that document or replaces it. `GET /api/onboarding` reads it. A user with no profile gets 404, and that read does not write a document.

The profile stores `username`, `first_name`, `location`, `age`, `gathering_size`, and five topics: `languages`, `locations`, `hobbies`, `interests`, and `festivals`. `location` is where that person is. `age` is a whole number from 13 to 120. `gathering_size` is one of `2-5`, `6-15`, `16-40`, or `40+`. Each topic is `{"knows": [], "wants_to_learn": []}`. `knows` is what that person already knows. `wants_to_learn` is what they want to learn more about. `hobbies` and `interests` stay separate. Compatibility matching compares one user's `knows` with another user's `wants_to_learn` on the same topic, along with location, age, and gathering size.

`username` is at most 40 characters. `first_name` and `location` are at most 80. Each list holds at most 20 strings, and each string is at most 80 characters. The response adds `user_id`, `created_at`, and `updated_at`. A later PUT keeps `created_at` and refreshes `updated_at`. Validation lives in `backend/app/onboarding.py`. The caller is `g.user_id`. A user id in the JSON body is rejected.

## Website

The product is the React site in `web/`. Clerk's React SDK signs the user in. The site sends `Authorization: Bearer` to the API. Saving a page is a title and a URL. The onboarding flow and the match list live here. Future event discovery, attendance, and connect flows land here first.

## Extension, later

`extension/` is the later Chrome extension, not the app you run now. It will read the active tab and save it with the same Clerk session, then prompt on event-like pages once attendance APIs exist. A static sample of that popup is on the website. Session tokens do not go in `chrome.storage`.

## Secrets

`.env`, `web/.env`, `extension/.env`, and the Firebase service account JSON stay untracked. The Clerk publishable key is the only Clerk value that belongs in the website. The manifest `key` field is a public key.

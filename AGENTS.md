# Ticket Trapper

Find people who already know what you want to learn. The MVP is the React site in `web/`. The API is Flask. Clerk signs the user in. Firestore stores tickets and onboarding profiles. The Chrome extension in `extension/` is later.

## Layout

- `web/` React website. Vite, React, `@clerk/react`. This is what you run for the MVP.
- `backend/` Flask application factory. Run it from this directory.
- `extension/` Manifest V3 popup for later. Vite, React, CRXJS, `@clerk/chrome-extension`.
- `.env.example` API and Clerk settings. Copy to `.env` at the repo root.
- `web/.env.example` Vite settings. Copy to `web/.env`.
- `extension/.env.example` Vite settings when you work on the extension.

The unpacked extension id is `gpnknnpdogpdgeejedabdihnacblhmmj`. The public key in `extension/manifest.config.ts` pins that id. `CORS_ORIGINS` must include the website origin `http://localhost:5174` and, for later, `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj`.

## Who owns what

Clerk owns identity and sessions. The website calls `getToken()` and sends `Authorization: Bearer`. `caller_required` in `backend/app/auth.py` verifies that token when `AUTH_MODE=clerk` and sets `g.user_id` to the Clerk user id. Read the caller from `g.user_id`. A user id in the JSON body is not the caller. `AUTH_MODE=local` still accepts `X-User-Id` for tests.

Firestore is the only store, in development and in production. This hackathon uses one Firebase project for both. There is no emulator and no second database. Tickets live at `users/{userId}/tickets/{ticketId}`. Onboarding profiles live at `users/{userId}/profile/onboarding`. The API reads and writes those paths with the Firebase Admin SDK. The website and the extension do not talk to Firestore.

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

The product is the React site in `web/`. Clerk's React SDK signs the user in. The site sends `Authorization: Bearer` to the API. Saving a page is a title and a URL. The onboarding flow and the match list live here.

## Sample profiles

The match list on the website ranks `web/src/sampleProfiles.ts` in the browser. `backend/sample_people.json` is the same 100 people for `python seed_profiles.py`. Seeding Firestore is optional for the MVP demo; the on-site ranking does not read those documents. If the TypeScript generator changes, refresh the JSON before seeding again.

## Extension, later

`extension/` is the later Chrome extension, not the app you run now. It will read the active tab and save it with the same Clerk session. A static sample of that popup is on the signed-out website. Session tokens do not go in `chrome.storage`. Docker does not start the extension.

## Secrets

`.env`, `web/.env`, `extension/.env`, and the Firebase service account JSON stay untracked. The Clerk publishable key is the only Clerk value that belongs in the website. The manifest `key` field is a public key.

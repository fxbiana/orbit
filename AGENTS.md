# Ticket Trapper

Chrome extension that saves the active tab as a ticket. The popup is React. The API is Flask. Clerk signs the user in. Firestore stores tickets.

## Layout

- `extension/` Manifest V3 popup. Vite, React, CRXJS, `@clerk/chrome-extension`.
- `backend/` Flask application factory. Run it from this directory.
- `.env.example` API and Clerk settings. Copy to `.env` at the repo root.
- `extension/.env.example` Vite settings. Copy to `extension/.env`.

The unpacked extension id is `gpnknnpdogpdgeejedabdihnacblhmmj`. The public key in `extension/manifest.config.ts` pins that id. Clerk allowed origins, `CLERK_AUTHORIZED_PARTIES`, and `CORS_ORIGINS` must include `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj`.

## Who owns what

Clerk owns identity, sessions, and the sign-in UI. The popup calls `getToken()` and sends `Authorization: Bearer`. `clerk_required` in `backend/app/auth.py` verifies that token with `authenticate_request` and sets `g.user_id` to the Clerk id (`user_...`). Read the caller from `g.user_id`. A user id in the JSON body is not the caller.

Firestore is the only ticket store, in development and in production. This hackathon uses one Firebase project for both. There is no emulator and no second database. Tickets live at `users/{clerkUserId}/tickets/{ticketId}`. The API reads and writes that path with the Firebase Admin SDK. The extension does not talk to Firestore. Passwords stay in Clerk.

`FIREBASE_CREDENTIALS_PATH` must point at the service account JSON for any route that reads or writes tickets, and for `GET /ready`. `GET /health` answers with no credentials file.

## Run

API, from `backend/` after the root `.env` exists:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app wsgi run --debug --port 5000
```

`/health` answers without Clerk or Firebase. `/ready` initializes Firebase Admin and reads Firestore. Signed-in routes need `CLERK_SECRET_KEY`.

Extension:

```bash
cd extension
cp .env.example .env
npm install
npm run dev
```

Load the CRXJS `dist` directory as an unpacked extension. In the Clerk dashboard, turn on the Native API and add the extension origin above to allowed origins. Put the publishable key in `extension/.env` as `VITE_CLERK_PUBLISHABLE_KEY`.

Before sign-in from the popup works, the Clerk instance also has to allow that origin. Popup auth is limited to methods that fit a small window. Email code and password work. A full-page OAuth redirect does not.

## Routes

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | public |
| GET | `/ready` | public, needs Firebase credentials and Firestore |
| GET | `/api/me` | Clerk session |
| GET | `/api/tickets` | Clerk session |
| POST | `/api/tickets` | Clerk session, JSON `{ "title", "url" }` |

Decorator order on a view is `@bp.get` or `@bp.post`, then `@clerk_required`. New routes go on a blueprint under `backend/app/routes/` and return JSON.

## Tickets

Each ticket document stores `title`, `url`, `status`, and `created_at`. `status` defaults to `open`. `title` max length is 500. `url` max length is 2000. The API returns `{id, title, url, status, created_at}`. `GET /api/tickets` returns that user's tickets, newest first. A Clerk id with no tickets returns an empty list and does not write a user document.

Do not add Postgres, a second database, or SQLite.

## Extension

Tab capture stays in the popup (`extension/src/tabs.ts`). `activeTab` is granted when the toolbar popup opens. The service worker (`extension/src/background/index.ts`) is the install hook. If a later feature needs a token in the service worker, use the `@clerk/chrome-extension` background client there. Session tokens do not go in `chrome.storage`.

`host_permissions` includes `http://localhost:5000/*` for the API and `https://*.clerk.accounts.dev/*` for Clerk's Frontend API. Add a production host there when one exists.

## Secrets

`.env`, `extension/.env`, and the Firebase service account JSON stay untracked. The Clerk publishable key is the only Clerk value that belongs in the extension. The manifest `key` field is a public key.

# Setup

Ticket Trapper needs Python, Node, Chrome, and one Firebase project with Firestore. Development and production use that same Firebase project for this hackathon. There is no emulator and no second database.

The unpacked extension id is `gpnknnpdogpdgeejedabdihnacblhmmj`. `CORS_ORIGINS` uses the origin `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj`.

## Software

| Tool | Version | Used for |
| --- | --- | --- |
| Python | 3.10 or newer | Flask API |
| Node.js | 20.9 or newer | Extension build |
| Chrome | current stable | Load the unpacked extension |

From the repo root, confirm the first two:

```bash
python3 --version
node --version
```

## Sign-in

The popup signs in with Clerk. `AUTH_MODE=clerk` in the root `.env` makes the API require a Clerk session token. Firestore stores that Clerk user's tickets and onboarding profile.

In the Clerk dashboard, turn on the Native API and add `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj` to allowed origins. Email code and password fit the popup. A full-page OAuth redirect does not.

## Firebase

Use one Firebase project for local development and for production.

1. In the Firebase console, create a project (or open the existing one) and turn on Firestore.
2. Open Project settings, Service accounts, and generate a new private key. That downloads a JSON file.
3. Keep the file outside git. The repo ignores `*-firebase-adminsdk-*.json` and `service-account*.json`.
4. Set `FIREBASE_CREDENTIALS_PATH` in the root `.env` to that file's absolute path.

The API reads and writes `users/{clerkUserId}/tickets/{ticketId}` with the Firebase Admin SDK. The extension does not use a Firebase client.

## Env files

Two files. Both are gitignored.

```bash
cp .env.example .env
cp extension/.env.example extension/.env
```

Root `.env`, read by the API:

| Variable | Required | Value |
| --- | --- | --- |
| `AUTH_MODE` | already set | `clerk` |
| `CLERK_SECRET_KEY` | yes, for signed-in routes | Clerk secret key |
| `CLERK_AUTHORIZED_PARTIES` | already set | `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj` |
| `CORS_ORIGINS` | already set | same origin |
| `CLERK_JWT_KEY` | no | PEM public key from the Clerk API keys page. When set, the API checks tokens on this machine. When empty, it fetches Clerk's keys with the secret key. |
| `FIREBASE_CREDENTIALS_PATH` | yes, for tickets and `/ready` | Absolute path to the Firebase service account JSON for the shared project |

`extension/.env`, read by Vite:

| Variable | Required | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | already set | `http://localhost:5000` |

## API

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app wsgi run --debug --port 5000
```

Check it:

```bash
curl -s http://localhost:5000/health
curl -s http://localhost:5000/ready
```

`/health` returns `{"status":"ok"}` with no credentials file. `/ready` returns the same body after Firebase Admin initializes and reads Firestore. If `FIREBASE_CREDENTIALS_PATH` is empty or the file is missing, `/ready` returns a JSON error that names that problem.

`GET /api/tickets` with no `Authorization` header returns 401. The popup sends a Clerk session token.

## Sample profiles

One hundred sample people live in `extension/src/popup/sampleProfiles.ts`. From `backend/`, with the virtualenv active and `FIREBASE_CREDENTIALS_PATH` set:

```bash
python seed_profiles.py
```

That writes 100 onboarding documents at `users/{uuid}/profile/onboarding`. The uuid is that person's id, and it is a valid `X-User-Id`.

Each document stores `username`, `first_name`, `location`, `age`, `gathering_size`, and the five topics: `languages`, `locations`, `hobbies`, `interests`, and `festivals`. The write also sets `user_id`, `created_at`, and `updated_at`.

`compatibility_score` and `matched_on` are computed for a viewer. They are not fields on the document. `PUT /api/onboarding` rejects both.

Running the script again replaces those same 100 documents and keeps `created_at`.

With the API running, read one profile. This one is Amira, who knows Dance:

```bash
curl -s http://localhost:5000/api/onboarding \
  -H "X-User-Id: 1ec93661-7c2e-413f-8fde-908dcf28e4ba"
```

That request uses the local caller header. It answers when `AUTH_MODE=local`. With `AUTH_MODE=clerk`, the same path expects `Authorization: Bearer`.

## Extension

In another terminal:

```bash
cd extension
npm install
npm run dev
```

Open `chrome://extensions`, turn on Developer mode, and load the `extension/dist` directory that the dev server prints. The manifest public key keeps the id at `gpnknnpdogpdgeejedabdihnacblhmmj`. If Chrome shows a different id, the loaded folder is not this `dist`.

Restart `npm run dev` after changing `extension/.env`. Reload the extension in `chrome://extensions` after a rebuild.

Open the toolbar popup. Signed out, it shows sign-in and sign-up. Signed in, it shows the onboarding flow, and after that the active tab, a Save ticket button, and tickets stored for that Clerk user.

## What a finished setup can do

With the root `.env`, `extension/.env`, and the extension loaded:

1. `curl -s http://localhost:5000/ready` returns `{"status":"ok"}`.
2. The popup signs in with the Clerk user.
3. Save ticket writes the active tab to Firestore at `users/{clerkUserId}/tickets/{ticketId}`. The popup lists it on the next open.

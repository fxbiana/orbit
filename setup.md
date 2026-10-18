# Setup

Ticket Trapper needs Python, Node, and one Firebase project with Firestore. Development and production use that same Firebase project for this hackathon. There is no emulator and no second database.

The MVP product is the website at `http://localhost:5174`. The Chrome extension is later. Its unpacked id is `gpnknnpdogpdgeejedabdihnacblhmmj` when you load it.

## Software

| Tool | Version | Used for |
| --- | --- | --- |
| Python | 3.10 or newer | Flask API |
| Node.js | 20.9 or newer | Website build |
| Chrome | current stable | Browse the site (and load the extension later) |

From the repo root, confirm the first two:

```bash
python3 --version
node --version
```

## Sign-in

The website signs in with Clerk. `AUTH_MODE=clerk` in the root `.env` makes the API require a Clerk session token. Firestore stores that Clerk user's tickets and onboarding profile.

In the Clerk dashboard, allow `http://localhost:5174` (and `http://127.0.0.1:5174` if you use that host). When you work on the extension later, also allow `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj` and turn on the Native API for that origin.

## Firebase

Use one Firebase project for local development and for production.

1. In the Firebase console, create a project (or open the existing one) and turn on Firestore.
2. Open Project settings, Service accounts, and generate a new private key. That downloads a JSON file.
3. Keep the file outside git. The repo ignores `*-firebase-adminsdk-*.json` and `service-account*.json`.
4. Set `FIREBASE_CREDENTIALS_PATH` in the root `.env` to that file's absolute path.

The API reads and writes `users/{clerkUserId}/tickets/{ticketId}` and `users/{clerkUserId}/profile/onboarding` with the Firebase Admin SDK. The website does not use a Firebase client.

## Env files

Two files for the MVP. Both are gitignored.

```bash
cp .env.example .env
cp web/.env.example web/.env
```

Root `.env`, read by the API:

| Variable | Required | Value |
| --- | --- | --- |
| `AUTH_MODE` | already set | `clerk` |
| `CLERK_SECRET_KEY` | yes, for signed-in routes | Clerk secret key |
| `CLERK_AUTHORIZED_PARTIES` | already set | website origins, plus extension origins for later |
| `CORS_ORIGINS` | already set | same list |
| `CLERK_JWT_KEY` | no | PEM public key from the Clerk API keys page. When set, the API checks tokens on this machine. When empty, it fetches Clerk's keys with the secret key. |
| `FIREBASE_CREDENTIALS_PATH` | yes, for tickets, onboarding, and `/ready` | Absolute path to the Firebase service account JSON for the shared project |

`web/.env`, read by Vite:

| Variable | Required | Value |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `VITE_API_BASE_URL` | already set | `http://localhost:5000` |

## Docker

Docker Desktop is enough. From the repo root, after both env files exist and `FIREBASE_CREDENTIALS_PATH` is the absolute path of the service account JSON, with ports 5000 and 5174 free:

```bash
docker compose up --build
```

That starts two containers. The API container runs `flask --debug` on port 5000. The website container runs Vite on port 5174.

Leave `VITE_API_BASE_URL` at `http://localhost:5000`. The browser is outside Docker and uses the published ports.

`GET /health` and `GET /ready` are the same checks as below. `docker compose ps` shows both containers healthy once Vite is listening.

`docker compose restart api` re-reads the root `.env`. `docker compose restart web` re-reads `web/.env`. A different `FIREBASE_CREDENTIALS_PATH` needs `docker compose up` again, because that path is the file mounted into the API container. After a `package-lock.json` or `requirements.txt` change, run `docker compose up --build` again.

Optional seed into Firestore (not required for the on-site match list):

```bash
docker compose exec api python seed_profiles.py
```

Tests:

```bash
docker compose exec api pytest
```

`docker compose down` stops the containers and keeps the `web_node_modules` volume. The next sections are the same run, without Docker.

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

`GET /api/tickets` with no `Authorization` header returns 401. The website sends a Clerk session token.

## Sample profiles

One hundred sample people live in `web/src/sampleProfiles.ts`. The website ranks them in the browser after onboarding. The same people are committed as `backend/sample_people.json` for Firestore seeding.

From `backend/`, with the virtualenv active and `FIREBASE_CREDENTIALS_PATH` set:

```bash
python seed_profiles.py
```

That writes 100 onboarding documents at `users/{uuid}/profile/onboarding`. The uuid is that person's id, and it is a valid `X-User-Id`.

Each document stores `username`, `first_name`, `location`, `age`, `gathering_size`, and the five topics: `languages`, `locations`, `hobbies`, `interests`, and `festivals`. The write also sets `user_id`, `created_at`, and `updated_at`.

`compatibility_score` and `matched_on` are computed for a viewer. They are not fields on the document. `PUT /api/onboarding` rejects both.

Running the script again replaces those same 100 documents and keeps `created_at`.

With the API running and `AUTH_MODE=local`, read one profile. This one is Amira, who knows Dance:

```bash
curl -s http://localhost:5000/api/onboarding \
  -H "X-User-Id: 1ec93661-7c2e-413f-8fde-908dcf28e4ba"
```

With `AUTH_MODE=clerk`, the same path expects `Authorization: Bearer`.

If you change the generator in `web/src/sampleProfiles.ts`, refresh `backend/sample_people.json` before seeding again (export `SAMPLE_PEOPLE` from that module).

## Website

In another terminal:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5174`. Restart `npm run dev` after changing `web/.env`.

Signed out, the hero explains the product and shows a static sample of the future extension. Signed in, the site walks through onboarding (prefilled so you can click through), then shows people ranked against those answers. Saved pages are under a details block on that screen.

## Extension, later

```bash
cd extension
cp .env.example .env
npm install
npm run dev
```

Open `chrome://extensions`, turn on Developer mode, and load the `extension/dist` directory that the dev server prints. The manifest public key keeps the id at `gpnknnpdogpdgeejedabdihnacblhmmj`.

## What a finished MVP setup can do

With the root `.env`, `web/.env`, API on 5000, and site on 5174:

1. `curl -s http://localhost:5000/ready` returns `{"status":"ok"}`.
2. The site signs in with the Clerk user.
3. Onboarding saves the profile to Firestore at `users/{clerkUserId}/profile/onboarding`.
4. The match list ranks the sample set in the browser (no seed step required).
5. Saving a page writes `users/{clerkUserId}/tickets/{ticketId}`.

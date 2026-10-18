# Ticket Trapper

Find people who already know what you want to learn.

The product for the MVP is the React site in `web/`. The API is Flask. Clerk signs the user in. Firestore stores onboarding profiles and saved pages. Development and production use the same Firebase project for this hackathon. There is no emulator.

`AGENTS.md` is the map of which system owns which data. The Chrome extension in `extension/` is later.

## Docker

Copy the env files, set `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `FIREBASE_CREDENTIALS_PATH` (absolute path of the service account JSON). Ports 5000 and 5174 need to be free. From the repo root:

```bash
cp .env.example .env
cp web/.env.example web/.env
docker compose up --build
```

The API is on port 5000. The website is on port 5174. A save under `backend/` restarts the API process. A save under `web/` refreshes through Vite.

`VITE_API_BASE_URL` stays `http://localhost:5000`. `docker compose restart api` re-reads the root `.env`. `docker compose restart web` re-reads `web/.env`. A different `FIREBASE_CREDENTIALS_PATH` needs `docker compose up` again, because that path is the file mounted into the API container.

Optional: write the 100 sample profiles into Firestore (the match list on the site does not need this; it scores in the browser):

```bash
docker compose exec api python seed_profiles.py
```

## Website

```bash
cp web/.env.example web/.env
cd web
npm install
npm run dev
```

Open `http://localhost:5174`. Put the Clerk publishable key in `web/.env` as `VITE_CLERK_PUBLISHABLE_KEY`. That origin must be in `CORS_ORIGINS` and `CLERK_AUTHORIZED_PARTIES` in the root `.env`.

Signed in, the flow is onboarding pages, then a ranked match list from the sample set. Saved pages stay under a details block after matches.

## API

```bash
cp .env.example .env
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app wsgi run --debug --port 5000
```

Set `CLERK_SECRET_KEY`, `AUTH_MODE=clerk`, and `FIREBASE_CREDENTIALS_PATH` in the root `.env`. The path is the absolute path of a Firebase service account JSON file. `GET /health` returns `{"status": "ok"}` with no credentials file. `GET /ready` needs that file and a reachable Firestore.

## Extension, later

```bash
cd extension
cp .env.example .env
npm install
npm run dev
```

Load the printed `dist` directory in `chrome://extensions` as an unpacked extension when you work on that path. The manifest public key pins the id to `gpnknnpdogpdgeejedabdihnacblhmmj`. Docker does not start the extension for the MVP.

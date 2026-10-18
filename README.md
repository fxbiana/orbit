# Ticket Trapper

Chrome extension that saves the active tab as a ticket.

The popup is React. The API is Flask. Clerk signs the user in. Firestore stores the ticket. Development and production use the same Firebase project for this hackathon. There is no emulator.

`AGENTS.md` is the map of which system owns which data.

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

## Extension

```bash
cd extension
cp .env.example .env
npm install
npm run dev
```

Load the printed `dist` directory in `chrome://extensions` as an unpacked extension. The manifest public key pins the id to `gpnknnpdogpdgeejedabdihnacblhmmj`.

Put the publishable key in `extension/.env` as `VITE_CLERK_PUBLISHABLE_KEY`. The popup signs in with Clerk, then saves the active tab and the onboarding profile for that user.

# Ticket Trapper

Chrome extension that saves the active tab as a ticket.

The popup is React. The API is Flask. A local user id stands in for sign-in. Firestore stores the ticket. Development and production use the same Firebase project for this hackathon. There is no emulator.

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

Set `FIREBASE_CREDENTIALS_PATH` in the root `.env`. The path is the absolute path of a Firebase service account JSON file. `GET /health` returns `{"status": "ok"}` with no credentials file. `GET /ready` needs that file and a reachable Firestore. `AUTH_MODE` stays `local`.

## Extension

```bash
cd extension
cp .env.example .env
npm install
npm run dev
```

Load the printed `dist` directory in `chrome://extensions` as an unpacked extension. The manifest public key pins the id to `gpnknnpdogpdgeejedabdihnacblhmmj`.

The popup saves the active tab and the onboarding profile for a user id it keeps in `chrome.storage.local`. Clerk sign-in is not part of this flow.

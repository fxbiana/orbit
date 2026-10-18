# Devpost — Orbit

Copy-ready sections. Claim only what exists on `cursor/orbit-mvp-3955`. Unbuilt work stays under **What’s Next**.

---

## Elevator Pitch

Orbit helps you find people who already know what you want to learn — then turn that overlap into a real-world plan. Sign in, answer a short interest profile, see ranked peers, create an Open Plan others can join, and save pages you care about from the site or a Chrome extension into the same account.

---

## Inspiration

One of us joined an international student club expecting instant community and instead got a feed of events and a room full of strangers. Everyone wanted coffee, concerts, or a language exchange — but matching on “who actually fits me” meant awkward DMs or going alone. Group chats didn’t rank compatibility; ticket apps didn’t know our hobbies. Orbit started from that gap: **preference overlap first**, then a lightweight Open Plan to meet in person, without pretending a match score is a friendship.

---

## What It Does

**Built on this branch**

- **Sign in with Clerk** on the website (same identity model for the extension).  
- **Onboarding profile** — location, age, gathering size, and five topics (`languages`, `locations`, `hobbies`, `interests`, `festivals`), each with `knows` and `wants_to_learn`.  
- **Peer matches** — `GET /api/matches` scores other Firestore profiles and returns limited fields + reasons; the site loads that list (falls back to samples if none).  
- **Open Plans** — create a plan (title, activity type, location, optional time, capacity), list open plans, join under capacity; members stored under `plans/{id}/members/{userId}`.  
- **Plan member matches** — `GET /api/plans/<id>/matches` ranks compatibility among members.  
- **Save a page** — store title + URL as a ticket under your user.  
- **Seeded peers** — one hundred sample profiles can be written to Firestore for demos.  
- **Chrome extension scaffold** — Manifest V3 popup that can save the active tab through the same API (Clerk + API required).

---

## How We Built It

| Piece | Stack |
| --- | --- |
| Website | React + Vite (`web/`), Clerk React SDK, Bearer calls to Flask |
| API | Flask app factory (`backend/`), `@caller_required`, JSON blueprints |
| Auth | Clerk sessions; Flask verifies JWT when `AUTH_MODE=clerk` |
| Data | Firestore only via Firebase Admin — onboarding, tickets, `plans/{id}` + members |
| Matching | Server-side port of the client scorer (`backend/app/matching.py`) |
| Plans | Validation in `backend/app/plans.py`; routes under `/api/plans` |
| Extension | Manifest V3, Vite/CRXJS, `@clerk/chrome-extension` — same ticket POST |
| Ops | Docker Compose; `seed_profiles.py` for demo peers |

Product decisions locked in `AGENTS.md`: website owns the brain; extension is capture; tickets ≠ attendance; match ≠ friend; no second database.

---

## Challenges

- **Identity vs body spoofing** — caller from verified token (`g.user_id`) only.  
- **Match privacy** — score + limited fields, not full topic dumps.  
- **Peer discovery** — collection-group read of onboarding profiles; empty without seed.  
- **Shared intent without Ticketmaster** — Open Plans as the hackathon “meet up” surface before canonical events.  
- **Two clients, one API** — extension and website share routes; no Firestore in the extension.  
- **Scope** — friend graphs and Spotify stay off the critical path.

---

## What’s Next

- [ ] Always-on API match list (no sample fallback) after reliable seeding  
- [ ] Plan-member matches surfaced in the UI  
- [ ] Canonical **events** + `interested` / `going` attendance  
- [ ] Filter matches by shared event intent  
- [ ] Ticketmaster (or similar) ingest into the same event shape  
- [ ] Connect request → accept (consent edge ≠ match score)  
- [x] Spotify listening suggests topic chips; the user confirms before save  
- [ ] Extension prompts on event-like pages after attendance APIs exist  

---

## Links for judges (fill in)

- Demo video:  
- Repo:  
- Live site:  
- Devpost:  

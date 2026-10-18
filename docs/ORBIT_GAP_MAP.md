# Orbit gap map

Pitch claims vs branch `cursor/orbit-mvp-3955` (including parallel work on this tree). Owner = who closes any remaining gap. Invariant = locked rule from `AGENTS.md` / schema brief.

| Pitch claim | Status | Owner | Invariant |
| --- | --- | --- | --- |
| Brand as Orbit | **Done** on web + extension popup; some root README still Ticket Trapper | Docs polish optional | Rename is copy; do not rewrite data model |
| Clerk sign-in on website | **Done** | — | Caller = Clerk JWT → `g.user_id`; never body `user_id` |
| Interest onboarding (`knows` / `wants_to_learn`) | **Done** | — | Keep field limits; five topics; hobbies ≠ interests |
| Ranked peer matches from Firestore | **Done** API; **UI wired** with sample fallback if empty/error | Ops (seed) | Match = score + limited fields; match ≠ friend |
| Compatibility scoring | **Done** — `backend/app/matching.py` | — | Same semantics as sample `compatibilityWith` |
| Seeded demo peers | **Done** script; **must run** in env | Ops / SE | Seed writes onboarding only; no scores on docs |
| Save a page (title + URL) | **Done** — tickets API + web `SavePage` | — | Ticket ≠ attendance / ≠ plan |
| Extension saves active tab | **Code present**; product still “later”; usable for demo with Clerk | Extension | Same `POST /api/tickets`; no Firestore in extension |
| Open Plans create / list / join | **Done** — API + `Plans.tsx` | — | Membership explicit; not auto from match score |
| Plan member compatibility | **API done** — `GET /api/plans/<id>/matches`; UI optional | Web (P1) | Reuses match scorer; limited fields |
| Shared event intent via Ticketmaster events | **Design only** | Later | Events ≠ tickets; Ticketmaster = ingest |
| Mark going / interested on events | **Not coded** | Later | Manual attendance is source of truth |
| Friend / connect request → accept | **Not coded** | Later | Match ≠ friend |
| Spotify listening → topic chips | **Code present** | — | `POST /api/spotify/import` suggests the five topics; the user confirms by saving onboarding. Optional model via `AI_API_KEY`. |
| Purchase-page heuristics | **Out of scope** | — | Never auto-write attendance |
| Push / notification fan-out | **Out of scope** | — | Extension does not own notifications |

### Status legend

| Status | Meaning |
| --- | --- |
| **Done** | Implemented and callable once env is set |
| **API done** | Backend ready; UI may lag |
| **Code present** | Exists but not primary product path |
| **Design only / Not coded** | Schema or product lock only |

### Closest path to a coherent Orbit demo

1. Env + `seed_profiles.py`  
2. Smoke onboard → matches (API) → create/join plan → save page  
3. Leave events / connections as What’s Next  

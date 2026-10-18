# Schema & workflow brief (events, attendance, connections)

Audience: SE implementing the next layers. Sources of truth: `AGENTS.md` (Product decisions locked), `backend/app/onboarding.py`, `backend/app/firebase.py`, ticket/onboarding routes, `web/src/sampleProfiles.ts` scoring.

**Status:** Onboarding, tickets, matches, and **Open Plans** are implemented on this branch. Events / attendance / connections / Spotify below remain **design only**. Do not break existing onboarding, tickets, matches, or plans.

---

## 1. Current schema (locked — keep intact)

### Identity

| Concept | Source |
| --- | --- |
| Caller | Clerk user id → `g.user_id` via `@caller_required` |
| Body `user_id` | Rejected / ignored; never trust as caller |
| Store | Firestore only (Admin SDK). Extension never talks to Firestore |

### Path map (today)

```
users/{userId}/tickets/{ticketId}
users/{userId}/profile/onboarding
```

`userId` = Clerk user id string.

---

### Onboarding — `users/{userId}/profile/onboarding`

One document per user. `PUT` creates or replaces (keeps `created_at`). `GET` 404 if missing; read does not create.

**Stored fields** (after `parse_onboarding` + `save_onboarding`):

| Field | Type | Constraints |
| --- | --- | --- |
| `user_id` | string | Set server-side to caller |
| `username` | string | required, trimmed, max **40** |
| `first_name` | string | required, trimmed, max **80** |
| `location` | string | required, trimmed, max **80** (where the person is) |
| `age` | integer | required, **13–120**, not bool |
| `gathering_size` | string | required, one of `2-5` \| `6-15` \| `16-40` \| `40+` |
| `languages` | topic object | see below |
| `locations` | topic object | topic key ≠ profile `location` |
| `hobbies` | topic object | keep separate from `interests` |
| `interests` | topic object | |
| `festivals` | topic object | |
| `created_at` | timestamp | set on create; preserved on later PUT |
| `updated_at` | timestamp | refreshed every PUT |

**Topic object:**

```json
{
  "knows": ["string", "..."],
  "wants_to_learn": ["string", "..."]
}
```

| Rule | Value |
| --- | --- |
| Topic keys | exactly: `languages`, `locations`, `hobbies`, `interests`, `festivals` |
| Sides | exactly: `knows`, `wants_to_learn` |
| Max items per list | **20** |
| Max string length | **80** (whitespace-collapsed) |
| Dedup | casefold; first occurrence kept |
| Missing topic / side | treated as empty lists |
| Unexpected fields | **400** |

**API response** (`onboarding_response`): same profile fields + `user_id`, `created_at`, `updated_at` (ISO strings). Validation: `backend/app/onboarding.py`.

**Routes (shipped):**

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| GET | `/api/onboarding` | Clerk | 404 if none |
| PUT | `/api/onboarding` | Clerk | JSON profile; 201 create / 200 replace |

---

### Tickets — `users/{userId}/tickets/{ticketId}`

`ticketId` = server UUID. List ordered by `created_at` DESC. Empty list if none; does **not** create a user doc.

**Stored fields:**

| Field | Type | Constraints |
| --- | --- | --- |
| `title` | string | required on create, max **500** |
| `url` | string | required on create, max **2000** |
| `status` | string | default **`open`** on create; client cannot set on POST |
| `created_at` | timestamp | server UTC now |

**API response:** `{ id, title, url, status, created_at }`.

**Routes (shipped):**

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| GET | `/api/tickets` | Clerk | `{ "tickets": [...] }` |
| POST | `/api/tickets` | Clerk | `{ "title", "url" }` → 201 |

---

### Matches — shipped on this branch

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/matches` | Clerk | Optional `limit` (default 10, max 50). 404 if caller has no onboarding. |

Peers: `list_onboarding_peers` — collection-group scan on `profile` docs named `onboarding`, excludes caller. Response items: `user_id`, `username`, `first_name`, `location`, `age`, `gathering_size`, `compatibility_score`, `matched_on`. Scoring: `backend/app/matching.py` (port of `web/src/sampleProfiles.ts` `compatibilityWith`). Web `Matches.tsx` calls `listMatches`; falls back to local samples if the API errors or returns an empty list.

### Compatibility scoring (reference)

Server and sample client share the same semantics.

**Per topic (bidirectional):**

1. Overlap(`viewer.wants_to_learn`, `candidate.knows`) → “Knows {item}” (`teachHits`)
2. Overlap(`viewer.knows`, `candidate.wants_to_learn`) → “Wants {item}” (`learnHits`)
3. Case-insensitive string overlap

**Score (cap 100):**

| Signal | Points |
| --- | --- |
| First teach hit | +40; each extra teach hit up to +3 → +10 each |
| Learn hits | +6 each, max 2 hits |
| Same `location` (city string, casefold) | +12 |
| Same `gathering_size` | +8 |
| Age Δ ≤ 5 | +10 |
| Age Δ ≤ 12 (else) | +4 |

Match list visibility (locked product): score + limited fields (name, location, age/gathering, match reasons). Connect is separate.

---

## 2. Locked invariants

| Invariant | Meaning |
| --- | --- |
| **Tickets ≠ attendance** | Ticket = saved page (`title` + `url`). “I’m going / interested” = attendance on an **event**. Never overload tickets as Ticketmaster events. |
| **Match ≠ friend** | Match = preference score. Friend/connect = explicit request → accept edge. |
| **Website = brain** | Profiles, matches, events, attendance, connections created/viewed on site via Flask. |
| **Extension = capture + prompt** | May save ticket, suggest event link, ask “find people?”. No search ownership, no matching, no notifications fan-out, no social graph. |
| **Same API** | Anything the extension collects must be writable through the same Flask routes the website could call alone. |
| **Extend, don’t rewrite** | Keep onboarding + tickets shapes. Add collections beside them. |
| **No second DB** | Firestore only. No Postgres/SQLite. |
| **Caller from auth** | `g.user_id` only. Reject body `user_id` as caller. |
| **Spotify optional** | No audio-features / recommendations / related-artists dependency. Map genres into existing `interests` topic after user confirm. |

North star: preference compatibility → shared event intent → consented connection.

---

## 3. Additive schema

Open Plans (§3.5) are **shipped**. Events / attendance / connections / Spotify / optional ticket `event_id` remain proposals unless noted.

### 3.1 Events — `events/{eventId}`

Global collection (not under a user). Seeded/manual first; Ticketmaster later fills the **same** shape.

```
events/{eventId}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | max 200 suggested |
| `venue` | string | no | venue name |
| `city` | string | yes* | for location filter (*required for city search UX) |
| `starts_at` | timestamp | yes | event start (UTC) |
| `ends_at` | timestamp | no | |
| `external_source` | string | no | e.g. `manual`, `ticketmaster` |
| `external_id` | string | no | provider id; unique with source when set |
| `url` | string | no | public event / ticket page, max 2000 |
| `created_at` | timestamp | yes | server |
| `updated_at` | timestamp | yes | server |

**Indexes (composite) — plan before query:**

| Query intent | Fields |
| --- | --- |
| City upcoming list | `city` ASC, `starts_at` ASC |
| Dedup ingest | `external_source` ASC, `external_id` ASC (unique app-side) |
| Optional title prefix | consider Algolia/client filter later; not required for seed |

Collection-group / single-field: `starts_at` alone if you list globally.

---

### 3.2 Attendance — `users/{userId}/attendance/{eventId}`

Doc id **=** `eventId` (one attendance row per user per event).

| Field | Type | Notes |
| --- | --- | --- |
| `event_id` | string | same as doc id |
| `status` | string | **`interested`** \| **`going`** only |
| `updated_at` | timestamp | |
| `created_at` | timestamp | first mark |

**Semantics:**

- Upsert: PUT/POST sets status; idempotent.
- Clear: DELETE removes doc (or PATCH to clear — prefer DELETE).
- Ticket save does **not** auto-create attendance.
- Manual attendance is source of truth (even if a ticket URL looks like a purchase).

**Indexes for “who is going to E”:**

Attendance is under users, so “find attendees of event E” needs either:

| Option | Path / query | Tradeoff |
| --- | --- | --- |
| **A (recommended for v1)** | Mirror write: `events/{eventId}/attendees/{userId}` with `{ status, updated_at }` | Extra write; simple query |
| **B** | Collection-group query on `attendance` where `event_id == E` | Needs composite CG index; no mirror |

Propose **A** for hackathon speed: keep user subcollection as canonical; mirror on write in the same API handler (transaction or batch).

Mirror doc:

```
events/{eventId}/attendees/{userId}
  status: "interested" | "going"
  updated_at: timestamp
```

---

### 3.3 Connections / requests

Consent edge ≠ match score. Propose **directed request** with a stable pair key for uniqueness.

**Path (proposed):**

```
connections/{connectionId}
```

`connectionId` = sorted pair: `{minUserId}_{maxUserId}` so only one edge per unordered pair.

| Field | Type | Notes |
| --- | --- | --- |
| `from_user_id` | string | requester (Clerk id) |
| `to_user_id` | string | recipient |
| `status` | string | **`pending`** \| **`accepted`** \| **`rejected`** |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `responded_at` | timestamp | null until accept/reject |

**State machine:**

```
(none) --request--> pending --accept--> accepted
                       |
                       +--reject--> rejected
accepted/rejected: no auto-reopen in v1 (new request after reject = product decision; default: allow re-request only from rejected → pending by same from→to or either side — **flag for SE**, see § Ambiguities)
```

**Indexes:**

| Query | Fields |
| --- | --- |
| Inbox for me | `to_user_id` ASC, `status` ASC, `created_at` DESC |
| Outbox | `from_user_id` ASC, `status` ASC, `created_at` DESC |
| My friends | `status == accepted` + membership check in app (or denorm `member_ids` array + `array_contains`) |

Optional denorm for accepted friends list:

```
users/{userId}/friends/{otherUserId}
  connection_id, created_at
```

written only on accept. Keeps list queries cheap.

---

### 3.4 Optional ticket link — `event_id` on ticket

**Additive only** on `users/{userId}/tickets/{ticketId}`:

| Field | Type | Notes |
| --- | --- | --- |
| `event_id` | string \| null | optional; links capture to canonical event |

- Existing tickets omit the field; API response may include `event_id: null`.
- Setting `event_id` does **not** set attendance.
- Extension/site may prompt: save ticket → suggest event → mark attendance (separate calls).

Do not remove or rename `title`, `url`, `status`, `created_at`.

---

### 3.5 Open Plans — `plans/{planId}` (**shipped on this branch**)

**Status:** Implemented for the Orbit hackathon demo on `cursor/orbit-mvp-3955`. Validation: `backend/app/plans.py`. I/O: `backend/app/firebase.py`. Routes: `backend/app/routes/plans.py`. Web: `web/src/Plans.tsx`. Prefer this over full `events` + attendance for P0 “shared intent.”

Hackathon stand-in for “we’re actually meeting”: a user-created plan with explicit members. Does **not** replace canonical events (Ticketmaster later). Does **not** replace connections (friend graph). Does **not** overload tickets.

**Invariants (aligned with AGENTS):**

| Rule | Meaning |
| --- | --- |
| Match ≠ membership | High score never auto-joins a plan |
| Ticket ≠ plan | Saving a URL does not create a plan or attendance |
| Website = brain | Create / list / join on site via Flask |
| Caller from auth | `host_id` / join identity = `g.user_id` only |
| Extend, don’t rewrite | Top-level `plans` collection; onboarding + tickets intact |

**Paths:**

```
plans/{planId}
plans/{planId}/members/{userId}
```

**Plan document** (as stored / returned)

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | required, trimmed, max **120** |
| `activity_type` | string | required: `coffee` \| `study` \| `workshop` \| `other` |
| `location_text` | string | required, trimmed, max **80** |
| `starts_at` | string \| null | optional ISO datetime string |
| `capacity` | int | default **6**; range **2–40** |
| `status` | string | **`open`** \| **`closed`**; default `open` on create |
| `host_id` | string | Clerk user id; set server-side on create |
| `created_at` | timestamp | server |
| `updated_at` | timestamp | server |

`planId` = server UUID. Reject unexpected body fields; never trust body `host_id` / `user_id` as caller.

**API response extras:** `member_count`, `viewer_joined`; detail also includes `members[]`.

**Member document** (`members/{userId}`)

| Field | Type | Notes |
| --- | --- | --- |
| `role` | string | **`host`** \| **`member`** |
| `joined_at` | timestamp | server |

- On create: write plan + host member (`role=host`).  
- Join: only if `status == open` and under `capacity`; **409** if already joined, closed, or full.  
- Leave / close endpoints: not required for P0 (not shipped).  
- `GET /api/plans/<id>/matches`: load other members’ onboarding profiles, run `rank_matches`.

**Routes (shipped)**

| Method | Path | Auth | Body / notes |
| --- | --- | --- | --- |
| GET | `/api/plans` | Clerk | Open plans, newest first (`status == open` + `order_by created_at`) |
| POST | `/api/plans` | Clerk | `{ title, activity_type, location_text, starts_at?, capacity? }` → 201 |
| GET | `/api/plans/<plan_id>` | Clerk | Plan + members |
| POST | `/api/plans/<plan_id>/join` | Clerk | 201 plan; 409 closed / full / already joined |
| GET | `/api/plans/<plan_id>/matches` | Clerk | Ranked member compatibility; 404 if caller has no onboarding |

**Indexes**

| Query | Approach |
| --- | --- |
| Open plans newest first | Composite: `status` ASC, `created_at` DESC — create in Firebase if the first list fails |
| Members of plan | Subcollection list — no composite index |

**Relation to events (Next)**

Open Plans are the demo-sized “shared intent” surface. Canonical `events/{eventId}` + attendance remain the product **Next** layer for Ticketmaster-scale discovery. Do not rename tickets to plans. Do not store plan membership inside onboarding topics.
---

### 3.6 Optional Spotify snapshot — `users/{userId}/profile/spotify`

Separate document; **no OAuth tokens** in Firestore.

| Field | Type | Notes |
| --- | --- | --- |
| `genres` | string[] | normalized, capped (e.g. 20 × 80) |
| `imported_at` | timestamp | |
| `source` | string | e.g. `clerk_spotify` |

Flow (later): Clerk Spotify external account → Flask import with user token from Clerk → suggest chips into `interests.knows` / `interests.wants_to_learn` → user confirms → `PUT /api/onboarding`. Do not add a sixth topic key. No Spotify audio-features / recommendations APIs.

---

### Path map (target)

```
plans/{planId}                               # Open Plans (shipped)
plans/{planId}/members/{userId}

events/{eventId}                             # Next (canonical events)
events/{eventId}/attendees/{userId}          # mirror (proposed)

users/{userId}/tickets/{ticketId}           # + optional event_id
users/{userId}/profile/onboarding            # unchanged
users/{userId}/profile/spotify               # optional snapshot
users/{userId}/attendance/{eventId}          # interested | going
users/{userId}/friends/{otherUserId}         # optional denorm on accept

connections/{connectionId}                  # pending | accepted | rejected
```

---

## 4. Workflows

Actors: **Web**, **Extension**, **Flask**, **Firestore**, **Clerk**.

### 4.1 Onboard → match

```
Web                Clerk              Flask                 Firestore
 |-- Sign in ------>|                   |                      |
 |<-- session ------|                   |                      |
 |-- getToken() --->|                   |                      |
 |-- PUT /api/onboarding + Bearer ----->|                      |
 |                                      |-- set profile ------>|
 |<-- 201/200 profile ------------------|                      |
 |-- GET /api/onboarding (or matches) ->|                      |
 |                                      |-- read profiles ---->|
 |                                      |-- score (teach/learn |
 |                                      |   + location/age/gs) |
 |<-- ranked matches (limited fields) --|                      |
```

v1 engine: real peer matches from Firestore profiles **before** requiring events. Event filter is a later boost/filter on this list.

---

### 4.2 Save ticket (site vs extension)

**Same API.** Difference is who supplies `title`/`url`.

```
Site or Extension     Clerk           Flask              Firestore
 |-- getToken() ------>|                |                     |
 |-- POST /api/tickets {title,url} ---->|                     |
 |   [optional later: event_id]         |-- create ticket --->|
 |<-- 201 ticket -----------------------|                     |
```

| Client | Behavior |
| --- | --- |
| Web | User pastes/enters title + URL (or future event page) |
| Extension | Reads active tab title + URL; same POST; no Firestore; tokens not in `chrome.storage` |

Optional later: PATCH ticket to set `event_id` after user picks an event — still no attendance.

---

### 4.3 Mark going / interested

```
Web (primary)         Flask                    Firestore
 |-- PUT /api/events/{id}/attendance          |
 |   { "status": "going"|"interested" } ----->|
 |                                            |-- set users/.../attendance/{id}
 |                                            |-- set events/.../attendees/{uid}
 |<-- 200 attendance -------------------------|
```

Extension (after APIs exist): prompt “Mark as going?” → same PUT. Purchase-page heuristics are **later only** and never auto-write attendance without confirm.

---

### 4.4 Find people for event E

```
Web                     Flask                         Firestore
 |-- GET /api/events/E/people?min_score=.. ---------->|
 |                          |-- require caller profile |
 |                          |-- list attendees of E -->|  events/E/attendees
 |                          |-- load each onboarding -->|  users/*/profile/onboarding
 |                          |-- score vs caller        |
 |                          |-- filter/boost by status  |
 |                          |   (prefer going > interested)
 |<-- [{ user summary, score, matched_on, attendance }] |
```

Rules:

- Score = existing preference algorithm (not “friend”).
- Exclude self; optionally exclude already-accepted connections from “connect” CTA.
- Attendance filter: e.g. only `going`+`interested`, or query param.

---

### 4.5 Connect request → accept

```
Web A (requester)     Flask                    Firestore              Web B (recipient)
 |-- POST /api/connections { to_user_id } ---->|                         |
 |                                            |-- create pending ------->|
 |<-- 201 pending ----------------------------|                         |
 |                                                                      |-- GET inbox
 |                                            |<-- list to_user_id=B ---|
 |                                                                      |<-- pending
 |                                                                      |-- POST .../accept
 |                                            |-- status=accepted ------>|
 |                                            |-- optional friends denorm|
 |<-- (optional notify later) ----------------|                         |
```

Reject: same accept endpoint family with `reject`. Messaging / deeper contact gated on `accepted` once that surface exists.

---

## 5. API sketch

Matches and Open Plans below are **shipped**. Events / attendance / connections remain proposed.

Style: blueprint under `backend/app/routes/`, `@bp.get|post|put|delete` then `@caller_required`, JSON in/out, caller = `g.user_id`.

### Events

| Method | Path | Auth | Body / query | Response (sketch) |
| --- | --- | --- | --- | --- |
| GET | `/api/events` | Clerk | `?city=&from=` | `{ "events": [...] }` |
| GET | `/api/events/<event_id>` | Clerk | — | event doc |
| POST | `/api/events` | Clerk* | `{ title, city, starts_at, ... }` | 201 event (*seed/admin; or open create for hackathon — see Ambiguities) |

### Attendance

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| PUT | `/api/events/<event_id>/attendance` | Clerk | `{ "status": "interested"\|"going" }` | attendance |
| GET | `/api/events/<event_id>/attendance` | Clerk | — | caller’s row or 404 |
| DELETE | `/api/events/<event_id>/attendance` | Clerk | — | 204 |
| GET | `/api/me/attendance` | Clerk | — | list caller’s attendance |

### Event people (match ∩ attendance)

| Method | Path | Auth | Query | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/events/<event_id>/people` | Clerk | `status`, `min_score` | ranked limited profiles + score + attendance |

### Connections

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/connections` | Clerk | `{ "to_user_id" }` | 201 pending (409 if exists) |
| GET | `/api/connections` | Clerk | `?box=inbox\|outbox\|friends` | list |
| POST | `/api/connections/<id>/accept` | Clerk | — | accepted (403 if not `to_user_id`) |
| POST | `/api/connections/<id>/reject` | Clerk | — | rejected |

### Tickets (additive, when linking)

| Method | Path | Auth | Body | Notes |
| --- | --- | --- | --- | --- |
| POST | `/api/tickets` | Clerk | `{ title, url, event_id? }` | `event_id` optional; ignore unknown until implemented |
| PATCH | `/api/tickets/<id>` | Clerk | `{ "event_id": "..."\|null }` | proposed; ownership check |

### Matches (shipped; optional filters later)

| Method | Path | Auth | Query | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/matches` | Clerk | `limit?` (shipped); later `event_id?`, `min_score?` | ranked peers; limited fields |

### Open Plans (shipped — see §3.5)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/plans` | Clerk | open plans newest first |
| POST | `/api/plans` | Clerk | create + host member |
| GET | `/api/plans/<id>` | Clerk | detail + members |
| POST | `/api/plans/<id>/join` | Clerk | join if open and under capacity |
| GET | `/api/plans/<id>/matches` | Clerk | rank members vs caller |

### Spotify (later)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/spotify/import` | Clerk | writes `profile/spotify`; returns suggested interest chips — does not auto-merge into onboarding |

---

## 6. What NOT to do

1. Do not store attendance flags on ticket documents as the source of truth.
2. Do not treat a high match score as an accepted connection.
3. Do not put friend graphs or connection state inside onboarding topics.
4. Do not give the extension a Firebase client or service account.
5. Do not invent a parallel Ticketmaster-only schema; ingest into `events/{eventId}`.
6. Do not rewrite onboarding field names/limits or ticket required fields.
7. Do not depend on Spotify audio-features, recommendations, or related-artists.
8. Do not add Postgres/SQLite “just for events.”
9. Do not trust `user_id` in JSON bodies as the caller.
10. Do not auto-mark `going` from URL heuristics without an explicit user action.
11. Do not put OAuth tokens in Firestore (`profile/spotify` is a snapshot only).
12. Do not fan out social notifications from the extension.

---

## 7. Handoff checklist

### Orbit demo — first (mostly shipped; prove live)

- [ ] Read `AGENTS.md` → Product decisions (locked) + this doc + [`JAGMAN_FEASIBILITY.md`](JAGMAN_FEASIBILITY.md).
- [ ] Run `seed_profiles.py`; confirm matches UI shows API source.
- [ ] Smoke Open Plans (§3.5): create + join + list; add Firestore composite index if list query fails.
- [ ] Leave `onboarding.py` validation and ticket fields unchanged.

### Events next (after demo path)

- [ ] Add `events` collection + seed script (city + `starts_at`); deploy composite indexes before production queries.
- [ ] Implement attendance write path: user subcollection **and** attendee mirror (or document CG query choice).
- [ ] Website-first UX: list events by `profile.location`, mark interested/going.
- [ ] `GET .../people` = score existing algorithm ∩ attendance; return limited fields only.
- [ ] Do not start extension event prompts until attendance APIs exist.
- [ ] Connections after (or in parallel with) people-for-event: pending → accept/reject; pair-id uniqueness.
- [ ] Tests: auth on all new routes; isolation by `g.user_id`; attendance upsert; connect accept authorization.
- [ ] Ticketmaster later: map into same event fields; no second model.
- [ ] Spotify later: optional; chips → `interests` only after confirm.

---

## Ambiguities for the implementing SE

Resolve with product before coding edge cases; defaults suggested in italics.

1. **Who can create events?** Open to any signed-in user vs seed/admin-only. *Hackathon default: allow POST for signed-in users; Ticketmaster ingest is separate.*
2. **Reject → re-request?** *Allow new pending from either user after reject; block duplicate pending while one exists.*
3. **Going vs interested in people list:** filter both by default, sort `going` first, or query param only?
4. **Connection requires min match score?** Product says connect among compatible users — *enforce soft UI gate; hard API min score optional.*
5. **Ticket `event_id` validation:** must reference existing `events/{id}` or allow dangling until event upsert?
6. **City matching:** exact string vs normalized slug — onboarding `location` is free text today; event `city` should use the same convention or a normalized field.
7. **Attendee mirror vs collection-group:** this doc recommends mirror; pick one and stick to it for indexes.

---

## Related code pointers

| Area | Path |
| --- | --- |
| Locked product decisions | `AGENTS.md` |
| Feasibility (Jagman) | `docs/JAGMAN_FEASIBILITY.md` |
| Pitch gap map | `docs/ORBIT_GAP_MAP.md` |
| Onboarding validation | `backend/app/onboarding.py` |
| Firestore ticket/onboarding/peers I/O | `backend/app/firebase.py` |
| Matching / rank | `backend/app/matching.py` |
| Matches route | `backend/app/routes/matches.py` |
| Open Plans validation | `backend/app/plans.py` |
| Open Plans routes | `backend/app/routes/plans.py` |
| Ticket routes | `backend/app/routes/tickets.py` |
| Onboarding routes | `backend/app/routes/onboarding.py` |
| Auth / `g.user_id` | `backend/app/auth.py` |
| Sample scoring (client reference) | `web/src/sampleProfiles.ts` → `compatibilityWith` |
| Matches / plans client | `web/src/api.ts` → `listMatches`, `listPlans`, `createPlan`, `joinPlan` |
| Plans UI | `web/src/Plans.tsx` |
| Blueprint registration | `backend/app/__init__.py` |

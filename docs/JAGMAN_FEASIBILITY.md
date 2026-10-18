# Jagman — Orbit feasibility

**Branch:** `cursor/orbit-mvp-3955`  
**Verdict target:** Ship / Ship with cuts / Not feasible  
**Related:** [`ORBIT_GAP_MAP.md`](ORBIT_GAP_MAP.md) · [`SCHEMA_AND_WORKFLOW.md`](SCHEMA_AND_WORKFLOW.md) · [`DEVPOST.md`](DEVPOST.md) · locked decisions in [`AGENTS.md`](../AGENTS.md)

---

## Pitch → repo (today vs build)

| Orbit pitch claim | On this branch today | Remaining for a clean demo |
| --- | --- | --- |
| Orbit-branded website | **Done** — wordmark/hero/onboarding copy say Orbit | Minor doc/README rename noise only |
| Sign in, own a profile | Clerk + `GET/PUT /api/onboarding` + web flow | Env: Clerk keys |
| Rank people by shared interests | `GET /api/matches` + `matching.py` **shipped**; web tries API then falls back to samples | Run `seed_profiles.py` or list looks empty → sample fallback |
| Create / join an Open Plan | **API + web UI shipped** — `plans/*` routes, `Plans.tsx` create/list/join | Rehearse two accounts; confirm Firestore composite index for `status`+`created_at` |
| Compatibility among plan members | `GET /api/plans/<id>/matches` **shipped** | Optional in live script (P1) |
| Capture a tab into Orbit | Tickets API + web `SavePage`; extension popup (Orbit-titled) can save when Clerk configured | Load unpacked extension once, or demo save from site |
| Seeded peers | `seed_profiles.py` (100 people) | **Must run** before judges |
| Events / Ticketmaster / friends / Spotify | Schema + product locks only | **Cut from P0** |

---

## Architecture one-pager

```
[Web React :5174] --Bearer--> [Flask API :5000] --Admin SDK--> [Firestore]
       ^ Clerk session              ^ verifies JWT
[Extension MV3] ---same API--------+
  (capture / demo)                 g.user_id = Clerk id

users/{uid}/profile/onboarding
users/{uid}/tickets/{ticketId}
plans/{planId}
plans/{planId}/members/{uid}     # host | member
```

| Layer | Owns | Does not own |
| --- | --- | --- |
| **Clerk** | Identity, session JWT | Profiles, matches, plans |
| **Web** | Onboarding, matches UI, plans UI, save-page | Firestore client |
| **Flask** | Auth gate, validation, scoring, CRUD | Chrome tab APIs |
| **Firestore** | Only store (dev = prod project for hackathon) | — |
| **Extension** | Tab title/URL → `POST /api/tickets` | Matching, plans, social graph, tokens in `chrome.storage` |

No second DB. No emulator. Extension never talks to Firestore.

---

## Must-ship / nice / cut

### P0 — must demo (critical path)

1. Clerk sign-in on website  
2. Onboarding save → Firestore  
3. Ranked people (API + seed; sample fallback acceptable if called out)  
4. Open Plan create + join (already in tree — prove live)  
5. Save a page (site and/or extension)  
6. Seed profiles  

### P1 — nice if time

- Show `GET /api/plans/<id>/matches` in UI  
- Extension live save in the script (vs website-only save)  
- Devpost polish  

### P2 — cut (do not start)

- Ticketmaster / canonical events + attendance  
- Friend request graph  
- Spotify import  
- Purchase heuristics / push notifications  

---

## Effort by area (engineering chunks)

| Chunk | Size | Status on branch | Risk |
| --- | --- | --- | --- |
| Orbit web copy | **S** | **Done** | Low |
| Matches API + tests | **M** | **Done** | Collection-group scan |
| Wire matches UI + sample fallback | **S** | **Done** | Empty peers without seed |
| Open Plans API + tests | **M** | **Done** | Composite index `status`+`created_at` |
| Plans UI create/join | **S–M** | **Done** | Needs live API + auth |
| Extension save tab | **M** | Code present; product = later | Clerk MV3 config |
| Seed + rehearsal | **S** | Script ready; env-dependent | Creds blocker |
| Events / connections / Spotify | **L+** | Design only | Out of P0 |

**Trust already done (do not rebuild):**

- Product decisions locked — `AGENTS.md`  
- Onboarding + tickets CRUD  
- `GET /api/matches` + peer CG list + scoring  
- Open Plans routes + validation (`backend/app/plans.py`, `routes/plans.py`)  
- Schema brief (events/attendance/connections still additive **Next**)  
- Web Orbit branding, `Plans.tsx`, matches API attempt  

---

## Dependencies / order of work

```
1. Env: Clerk + FIREBASE_CREDENTIALS_PATH + CORS/authorized parties (web ± extension)
2. seed_profiles.py
3. Smoke: onboard → /api/matches → create plan → join (2nd user)
4. Optional: extension save → tickets on site
5. 5-minute rehearsal
```

Code path for P0 is largely **already merged on this branch**. Remaining work is **env + seed + rehearsal**, not greenfield features.

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Missing Clerk keys | No sign-in / 401s | Pre-check `web/.env` + root `.env` |
| Missing Firebase credentials | Data routes 503 | Absolute `FIREBASE_CREDENTIALS_PATH` |
| No seed | Matches fall back to samples | Always run `seed_profiles.py` |
| Plans list query index | `status == open` + `order_by created_at` may need composite index | Create index from Firebase error link once |
| Collection-group onboarding scan | Slow/empty/permissions | Seed first; `limit` capped at 50 |
| Extension Clerk in MV3 | Auth friction | Fallback: website `SavePage` |
| Scope creep (Ticketmaster/friends/Spotify) | Miss demo polish | Hard P2 cut |

---

## Recommended 5-minute demo script

1. **0:00–0:40** — Orbit hero → Sign in.  
2. **0:40–1:40** — Onboarding (Dance / interests pre-fill ok) → save.  
3. **1:40–2:30** — Ranked people (“People near you” if seeded; else admit sample fallback).  
4. **2:30–3:40** — Create Open Plan (“Coffee near campus”) → join from second account or show host + member_count.  
5. **3:40–4:40** — Save a page (site or extension) → appears in saved list.  
6. **4:40–5:00** — Close: online overlap → real-world plan. Next: events attendance, Ticketmaster, connect requests.

---

## Decision checklist

### Ship
- [ ] Clerk + Firebase work in the demo environment  
- [ ] Seeded peers; match list shows API source  
- [ ] Open Plan create + join proven live  
- [ ] One capture path shows a ticket  
- [ ] Script rehearsed once  

### Ship with cuts
- [ ] Match list works (API **or** sample fallback called out)  
- [ ] Open Plans work for one user (create) even if second-user join skipped  
- [ ] Extension dropped; website save only  
- [ ] No events/friends/Spotify attempted  

### Not feasible
- [ ] No Firebase credentials / cannot write profiles or plans  
- [ ] Clerk cannot sign in on web in time  
- [ ] Team starts P2 instead of rehearsal  
- [ ] Neither matches nor plans nor save visible in rehearsal  

**Default recommendation:** **Ship** if env+seed are ready; otherwise **Ship with cuts**. Feature code for P0 is already on this branch — feasibility is env and demo discipline, not missing modules.

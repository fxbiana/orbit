"""Write the 100 sample people to Firestore.

Each person is stored at ``users/{uuid}/profile/onboarding``. The uuid is that
person's id. ``compatibility_score`` and ``matched_on`` stay off the document:
they depend on the viewer, and ``parse_onboarding`` rejects them.

The people come from ``backend/sample_people.json``, exported from
``web/src/sampleProfiles.ts``. The website match list reads these documents
through ``GET /api/matches``.

The same script also writes one open Seattle show and one pending connection
addressed to ``DEMO_USER_ID``. Sign in as that user to see the request in
Reach. The connection stays pending, so Instagram, Discord, and Snapchat stay
hidden. No contact document is written.

It also writes score probes for the Clerk profile that already confirmed the
most Spotify-backed interests. Those probes check complementary scoring
against that person's knows, wants, city, age, and gathering size.

From ``backend/``:

    python seed_profiles.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from app.auth import _USER_ID
from app.connections import pair_id
from app.matching import PREFERENCE_TOPICS
from app.onboarding import TOPIC_KEYS, parse_onboarding
from app.plans import parse_plan_create
from score_probes import build_score_probes

STORED_FIELDS = ("username", "first_name", "location", "age", "gathering_size", *TOPIC_KEYS)
SAMPLE_PEOPLE_PATH = Path(__file__).resolve().parent / "sample_people.json"

# Reach inbox for a local demo session that sends ``X-User-Id: demo-seattle``
# (or a Clerk user with this id). Not a sample person from sample_people.json.
DEMO_USER_ID = "demo-seattle"
DEMO_PLAN_ID = "diwali-dance-night"
DEMO_PLAN_STARTS_AT = "2026-10-24T19:00:00-07:00"
DEMO_CONNECTION_INTRO = "Want to come to Diwali dance night?"


def load_sample_people() -> list[dict]:
    """Load the committed sample people JSON."""
    people = json.loads(SAMPLE_PEOPLE_PATH.read_text(encoding="utf-8"))
    if not isinstance(people, list):
        raise ValueError("sample_people.json must be a list")
    return people


def document_for(person: dict) -> tuple[str, dict]:
    """Return the Firestore user id and the onboarding fields for one person."""
    user_id = person.get("id")
    if not isinstance(user_id, str) or _USER_ID.fullmatch(user_id) is None:
        raise ValueError(f"sample id is not a valid user id: {user_id!r}")
    body = {field: person.get(field) for field in STORED_FIELDS}
    return user_id, parse_onboarding(body)


def demo_seed_documents(people: list[dict]) -> dict:
    """Open show plus a pending incoming request. No Firestore and no handles.

    The plan host is the first sample person. The request is from the second
    sample person to ``DEMO_USER_ID`` and stays ``pending``.
    """
    if len(people) < 2:
        raise ValueError("demo seed needs two sample people")
    host_id, _host_profile = document_for(people[0])
    from_id, _from_profile = document_for(people[1])
    if _USER_ID.fullmatch(DEMO_USER_ID) is None:
        raise ValueError(f"demo user id is not a valid user id: {DEMO_USER_ID!r}")

    plan = parse_plan_create(
        {
            "title": "Diwali dance night",
            "activity_type": "show",
            "location_text": "Seattle",
            "starts_at": DEMO_PLAN_STARTS_AT,
            "capacity": 4,
        }
    )
    plan["host_id"] = host_id
    plan["status"] = "open"

    connection_id = pair_id(from_id, DEMO_USER_ID)
    connection = {
        "from_user_id": from_id,
        "to_user_id": DEMO_USER_ID,
        "status": "pending",
        "intro": DEMO_CONNECTION_INTRO,
        "responded_at": None,
    }
    return {
        "plan_id": DEMO_PLAN_ID,
        "plan": plan,
        "member_id": host_id,
        "member": {"role": "host"},
        "connection_id": connection_id,
        "connection": connection,
    }


def _preference_knows(profile: dict) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for topic in PREFERENCE_TOPICS:
        raw = profile.get(topic) or {}
        if not isinstance(raw, dict):
            continue
        for item in raw.get("knows") or []:
            if not isinstance(item, str):
                continue
            key = item.casefold()
            if key in seen:
                continue
            seen.add(key)
            items.append(item)
    return items


def listener_for_probes(client) -> dict | None:
    """Onboarding profile whose confirmed interests include a Spotify import.

    Matching reads onboarding, so the probes are built from that document.
    The Spotify snapshot only decides which accounts are listeners.
    """
    best: tuple[int, str, dict] | None = None
    for snap in client.collection_group("profile").stream():
        if snap.id != "spotify":
            continue
        genres = (snap.to_dict() or {}).get("genres") or []
        if not isinstance(genres, list) or not genres:
            continue
        parts = snap.reference.path.split("/")
        if len(parts) < 2:
            continue
        user_id = parts[1]
        stored = client.document(f"users/{user_id}/profile/onboarding").get()
        if not stored.exists:
            continue
        profile = stored.to_dict() or {}
        knows = _preference_knows(profile)
        if not knows:
            continue
        rank = (len(knows), user_id)
        if best is None or rank > (best[0], best[1]):
            best = (len(knows), user_id, profile)
    if best is None:
        return None
    return best[2]


def score_probe_documents(viewer: dict) -> list[tuple[str, dict]]:
    """Validated onboarding documents for one listener."""
    return [document_for(person) for person in build_score_probes(viewer)]


def main() -> None:
    from app import create_app
    from app.firebase import firestore_client, save_onboarding

    people = load_sample_people()
    documents = [document_for(person) for person in people]
    demo = demo_seed_documents(people)
    app = create_app()
    with app.app_context():
        for user_id, profile in documents:
            save_onboarding(user_id, profile)
        now = datetime.now(timezone.utc)
        client = firestore_client()
        plan_ref = client.collection("plans").document(demo["plan_id"])
        plan_ref.set({**demo["plan"], "created_at": now, "updated_at": now})
        plan_ref.collection("members").document(demo["member_id"]).set(
            {**demo["member"], "joined_at": now}
        )
        client.collection("connections").document(demo["connection_id"]).set(
            {**demo["connection"], "created_at": now, "updated_at": now}
        )
        listener = listener_for_probes(client)
        probes = score_probe_documents(listener) if listener is not None else []
        for user_id, profile in probes:
            save_onboarding(user_id, profile)
    print(f"Wrote {len(documents)} onboarding profiles")
    print(f"Wrote {len(probes)} score probes")
    print(f"Example path: users/{documents[0][0]}/profile/onboarding")
    print(f"Open plan: plans/{demo['plan_id']}")
    print(f"Pending request to {DEMO_USER_ID}: connections/{demo['connection_id']}")


if __name__ == "__main__":
    main()

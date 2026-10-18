"""Write the 100 sample people to Firestore.

Each person is stored at ``users/{uuid}/profile/onboarding``. The uuid is that
person's id. ``compatibility_score`` and ``matched_on`` stay off the document:
they depend on the viewer, and ``parse_onboarding`` rejects them.

The people come from ``backend/sample_people.json``, exported from
``web/src/sampleProfiles.ts``. The website match list reads these documents
through ``GET /api/matches``.

From ``backend/``:

    python seed_profiles.py
"""

import json
from pathlib import Path

from app.auth import _USER_ID
from app.onboarding import TOPIC_KEYS, parse_onboarding

STORED_FIELDS = ("username", "first_name", "location", "age", "gathering_size", *TOPIC_KEYS)
SAMPLE_PEOPLE_PATH = Path(__file__).resolve().parent / "sample_people.json"


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


def main() -> None:
    from app import create_app
    from app.firebase import save_onboarding

    people = load_sample_people()
    documents = [document_for(person) for person in people]
    app = create_app()
    with app.app_context():
        for user_id, profile in documents:
            save_onboarding(user_id, profile)
    print(f"Wrote {len(documents)} onboarding profiles")
    print(f"Example path: users/{documents[0][0]}/profile/onboarding")


if __name__ == "__main__":
    main()

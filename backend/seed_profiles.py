"""Write the 100 sample people to Firestore.

Each person is stored at ``users/{uuid}/profile/onboarding``. The uuid is that
person's id. ``compatibility_score`` and ``matched_on`` stay off the document:
they depend on the viewer, and ``parse_onboarding`` rejects them.

From ``backend/``:

    python seed_profiles.py
"""

import json
import subprocess
import tempfile
from pathlib import Path

from app.auth import _USER_ID
from app.config import ROOT
from app.onboarding import TOPIC_KEYS, parse_onboarding

STORED_FIELDS = ("username", "first_name", "location", "age", "gathering_size", *TOPIC_KEYS)
EXTENSION = ROOT / "extension"


def load_sample_people() -> list[dict]:
    """Load SAMPLE_PEOPLE from the extension module."""
    esbuild = EXTENSION / "node_modules/esbuild/bin/esbuild"
    source = EXTENSION / "src/popup/sampleProfiles.ts"
    with tempfile.TemporaryDirectory() as tmp:
        outfile = Path(tmp) / "sampleProfiles.mjs"
        subprocess.run(
            [
                str(esbuild),
                str(source),
                "--bundle",
                "--format=esm",
                f"--outfile={outfile}",
            ],
            check=True,
            cwd=EXTENSION,
            capture_output=True,
            text=True,
        )
        completed = subprocess.run(
            [
                "node",
                "--input-type=module",
                "-e",
                "import { SAMPLE_PEOPLE } from "
                + json.dumps(outfile.as_uri())
                + "; process.stdout.write(JSON.stringify(SAMPLE_PEOPLE))",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    return json.loads(completed.stdout)


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

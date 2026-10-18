"""Sample people that exercise compatibility against one real profile.

Scoring is complementary. A hit is someone who knows what the viewer wants
to learn, or who wants what the viewer already knows (including Spotify
artists saved on ``interests.knows``). Sharing the same knows list does not
score. Languages never cross into the preference pool.

These people are not part of ``sample_people.json``. ``seed_profiles.py``
writes them beside the hundred demo profiles.
"""

from __future__ import annotations

from app.matching import PREFERENCE_TOPICS

TOPIC_KEYS = ("languages", *PREFERENCE_TOPICS)
LIST_CAP = 20


def _topic_items(profile: dict, topic: str, side: str) -> list[str]:
    raw = profile.get(topic) or {}
    if not isinstance(raw, dict):
        return []
    values = raw.get(side) or []
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, str) and item.strip()]


def _pooled(profile: dict, topics: tuple[str, ...], side: str) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for topic in topics:
        for item in _topic_items(profile, topic, side):
            key = item.casefold()
            if key in seen:
                continue
            seen.add(key)
            items.append(item)
            if len(items) >= LIST_CAP:
                return items
    return items


def _flip_case(text: str) -> str:
    return "".join(char.upper() if char.islower() else char.lower() for char in text)


def _near_miss(text: str) -> str:
    suffix = " night"
    trimmed = text[: 80 - len(suffix)].rstrip()
    return f"{trimmed}{suffix}"


def _empty_topics() -> dict:
    return {topic: {"knows": [], "wants_to_learn": []} for topic in TOPIC_KEYS}


def _person(
    probe_id: str,
    first_name: str,
    username: str,
    *,
    location: str,
    age: int,
    gathering_size: str,
    topics: dict | None = None,
) -> dict:
    person = {
        "id": probe_id,
        "username": username,
        "first_name": first_name,
        "location": location,
        "age": age,
        "gathering_size": gathering_size,
        **_empty_topics(),
    }
    for topic, sides in (topics or {}).items():
        person[topic] = {
            "knows": list(sides.get("knows") or []),
            "wants_to_learn": list(sides.get("wants_to_learn") or []),
        }
    return person


def build_score_probes(viewer: dict) -> list[dict]:
    """Return probe profiles whose scores isolate one rule each.

    Close probes copy the viewer's city, age, and gathering size. Far probes
    change all three. Preference knows are what Spotify suggestions become
    after the user confirms them.
    """
    knows = _pooled(viewer, PREFERENCE_TOPICS, "knows")
    wants = _pooled(viewer, PREFERENCE_TOPICS, "wants_to_learn")
    language_knows = _pooled(viewer, ("languages",), "knows")
    language_wants = _pooled(viewer, ("languages",), "wants_to_learn")

    city = str(viewer.get("location") or "Seattle")
    age = viewer.get("age") if isinstance(viewer.get("age"), int) else 28
    size = str(viewer.get("gathering_size") or "6-15")
    far_city = "London" if city.casefold() != "london" else "Austin"
    far_age = age + 25 if age + 25 <= 120 else max(13, age - 25)
    far_size = "40+" if size != "40+" else "2-5"
    close = {"location": city, "age": age, "gathering_size": size}
    far = {"location": far_city, "age": far_age, "gathering_size": far_size}

    one = knows[:1]
    two = knows[:2]
    flipped = [_flip_case(item) for item in two]
    missed = [_near_miss(item) for item in one]

    return [
        _person(
            "probe-both-ways",
            "Both ways",
            "bothways",
            **close,
            topics={
                "interests": {"knows": wants, "wants_to_learn": knows},
                "languages": {"knows": language_wants, "wants_to_learn": language_knows},
            },
        ),
        _person(
            "probe-every-artist",
            "Every artist",
            "everyartist",
            **close,
            topics={"interests": {"knows": [], "wants_to_learn": knows}},
        ),
        _person(
            "probe-two-artists",
            "Two artists",
            "twoartists",
            **close,
            topics={"interests": {"knows": [], "wants_to_learn": two}},
        ),
        _person(
            "probe-one-artist",
            "One artist",
            "oneartist",
            **close,
            topics={"interests": {"knows": [], "wants_to_learn": one}},
        ),
        _person(
            "probe-case-match",
            "Case match",
            "casematch",
            **close,
            topics={"interests": {"knows": [], "wants_to_learn": flipped}},
        ),
        _person(
            "probe-listed-twice",
            "Listed twice",
            "listedtwice",
            **close,
            topics={
                "hobbies": {"knows": [], "wants_to_learn": one},
                "festivals": {"knows": [], "wants_to_learn": one},
            },
        ),
        _person(
            "probe-far-listener",
            "Far listener",
            "farlistener",
            **far,
            topics={"interests": {"knows": [], "wants_to_learn": knows}},
        ),
        _person(
            "probe-teaches-wants",
            "Teaches wants",
            "teacheswants",
            **close,
            topics={"hobbies": {"knows": wants, "wants_to_learn": []}},
        ),
        _person(
            "probe-same-knows",
            "Same knows",
            "sameknows",
            **close,
            topics={"interests": {"knows": knows, "wants_to_learn": []}},
        ),
        _person(
            "probe-close-miss",
            "Close miss",
            "closemiss",
            **close,
            topics={"interests": {"knows": [], "wants_to_learn": missed}},
        ),
        _person(
            "probe-language-wall",
            "Language wall",
            "languagewall",
            **close,
            topics={"languages": {"knows": knows, "wants_to_learn": knows}},
        ),
        _person(
            "probe-city-only",
            "City only",
            "cityonly",
            **close,
        ),
        _person(
            "probe-no-overlap",
            "No overlap",
            "nooverlap",
            **far,
            topics={
                "hobbies": {"knows": ["Origami"], "wants_to_learn": ["Pottery"]},
                "languages": {"knows": ["Welsh"], "wants_to_learn": ["Latin"]},
            },
        ),
    ]

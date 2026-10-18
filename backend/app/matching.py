"""Peer compatibility scoring.

Port of ``compatibilityWith`` in ``web/src/sampleProfiles.ts``. Languages
compare only to languages. Hobbies, locations, interests, and festivals are
one preference pool: ``knows`` and ``wants_to_learn`` are combined before
overlap, so an item counts once. Location, gathering size, and age bonuses
are unchanged.
"""

from __future__ import annotations

DEFAULT_MATCH_LIMIT = 10
MAX_MATCH_LIMIT = 50
PREFERENCE_TOPICS = ("hobbies", "locations", "interests", "festivals")


def _topic_sides(profile: dict, topic: str) -> tuple[list[str], list[str]]:
    raw = profile.get(topic) or {}
    if not isinstance(raw, dict):
        return [], []
    knows = raw.get("knows") or []
    wants = raw.get("wants_to_learn") or []
    return (
        [item for item in knows if isinstance(item, str)],
        [item for item in wants if isinstance(item, str)],
    )


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _pooled(profile: dict, topics: tuple[str, ...]) -> tuple[list[str], list[str]]:
    knows: list[str] = []
    wants: list[str] = []
    for topic in topics:
        topic_knows, topic_wants = _topic_sides(profile, topic)
        knows.extend(topic_knows)
        wants.extend(topic_wants)
    return _unique(knows), _unique(wants)


def overlap(wanted: list[str], known: list[str]) -> list[str]:
    """Case-insensitive exact matches. Returns the spelling from ``known``."""
    known_by_key = {item.casefold(): item for item in known}
    hits: list[str] = []
    seen: set[str] = set()
    for item in wanted:
        key = item.casefold()
        if key in seen:
            continue
        match = known_by_key.get(key)
        if match is None:
            continue
        seen.add(key)
        hits.append(match)
    return hits


def compatibility_with(viewer: dict, candidate: dict) -> dict:
    """Return ``{"score": int, "matched_on": [str, ...]}`` capped at 100."""
    matched_on: list[str] = []
    teach_hits = 0
    learn_hits = 0

    for topics in (("languages",), PREFERENCE_TOPICS):
        viewer_knows, viewer_wants = _pooled(viewer, topics)
        candidate_knows, candidate_wants = _pooled(candidate, topics)
        for item in overlap(viewer_wants, candidate_knows):
            teach_hits += 1
            matched_on.append(f"Knows {item}")
        for item in overlap(viewer_knows, candidate_wants):
            learn_hits += 1
            matched_on.append(f"Wants {item}")

    score = 0
    if teach_hits > 0:
        score += 40 + min(teach_hits - 1, 3) * 10
    score += min(learn_hits, 2) * 6

    viewer_city = str(viewer.get("location") or "").casefold()
    candidate_city = str(candidate.get("location") or "")
    if viewer_city and candidate_city.casefold() == viewer_city:
        score += 12
        matched_on.append(f"Lives in {candidate_city}")

    viewer_size = viewer.get("gathering_size") or ""
    candidate_size = candidate.get("gathering_size") or ""
    if viewer_size and candidate_size == viewer_size:
        score += 8
        matched_on.append(f"Gathering {candidate_size}")

    viewer_age = viewer.get("age")
    candidate_age = candidate.get("age")
    if isinstance(viewer_age, int) and isinstance(candidate_age, int):
        age_delta = abs(viewer_age - candidate_age)
        if age_delta <= 5:
            score += 10
            matched_on.append("Similar age")
        elif age_delta <= 12:
            score += 4

    return {"score": min(100, score), "matched_on": matched_on}


def match_summary(peer: dict, score: int, matched_on: list[str]) -> dict:
    """Limited fields returned in a match list item."""
    return {
        "user_id": peer.get("user_id") or "",
        "username": peer.get("username") or "",
        "first_name": peer.get("first_name") or "",
        "location": peer.get("location") or "",
        "age": peer.get("age"),
        "gathering_size": peer.get("gathering_size") or "",
        "compatibility_score": score,
        "matched_on": list(matched_on),
    }


def rank_matches(viewer: dict, peers: list[dict], limit: int = DEFAULT_MATCH_LIMIT) -> list[dict]:
    """Score peers, sort by score desc then first_name, return the top ``limit``."""
    limit = max(0, min(int(limit), MAX_MATCH_LIMIT))
    ranked: list[dict] = []
    for peer in peers:
        result = compatibility_with(viewer, peer)
        ranked.append(match_summary(peer, result["score"], result["matched_on"]))
    ranked.sort(key=lambda item: (-item["compatibility_score"], item["first_name"] or ""))
    return ranked[:limit]


def parse_match_limit(raw) -> int:
    """Parse a ``limit`` query value. Invalid or missing values use the default."""
    if raw is None or raw == "":
        return DEFAULT_MATCH_LIMIT
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MATCH_LIMIT
    if value < 1:
        return DEFAULT_MATCH_LIMIT
    return min(value, MAX_MATCH_LIMIT)

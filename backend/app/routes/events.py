"""Nearby events for the signed-in profile.

The website calls this after onboarding. The extension will call the same
route later, when a tab opens, instead of searching Ticketmaster itself.
"""

from flask import Blueprint, abort, current_app, g, jsonify

from app.auth import caller_required
from app.firebase import get_onboarding
from app.ticketmaster import (
    TicketmasterError,
    preference_keywords,
    search_events,
    seeded_seattle_events,
)

bp = Blueprint("events", __name__, url_prefix="/api")


@bp.get("/events/nearby")
@caller_required
def nearby_events():
    profile = get_onboarding(g.user_id)
    if profile is None:
        abort(404, description="Save your profile before looking for events")

    city = str(profile.get("location") or "").strip()
    if not city:
        abort(400, description="Add a location before looking for nearby events")

    keywords = preference_keywords(profile)
    api_key = (current_app.config.get("TICKETMASTER_API_KEY") or "").strip()
    if api_key:
        try:
            events = search_events(api_key, city, keywords)
        except TicketmasterError:
            events = seeded_seattle_events()
    else:
        events = seeded_seattle_events()

    return jsonify({"city": city, "preferences": keywords, "events": events})

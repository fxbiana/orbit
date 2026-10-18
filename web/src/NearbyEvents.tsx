import { useEffect, useState } from "react"
import {
  createPlan,
  listMatches,
  listNearbyEvents,
  sessionToken,
  type Match,
  type NearbyEvent,
} from "./api"
import { PANEL_KEYS, invalidatePanels, loadCached, readCache } from "./panelCache"

function formatWhen(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3)
}

function mentionsTitle(person: Match, title: string): boolean {
  const titleWords = new Set(words(title))
  return person.matched_on.some((reason) => words(reason).some((word) => titleWords.has(word)))
}

function personForEvent(event: NearbyEvent, matches: Match[]): Match | null {
  if (matches.length === 0) return null
  const titled = matches.filter((person) => mentionsTitle(person, event.title))
  const pool = titled.length > 0 ? titled : matches
  return pool.reduce((best, person) =>
    person.compatibility_score > best.compatibility_score ? person : best,
  )
}

export function NearbyEvents({ getToken }: { getToken: () => Promise<string | null> }) {
  const cachedEvents = readCache<{
    events?: NearbyEvent[]
    city?: string
    preferences?: string[]
  }>(PANEL_KEYS.events)
  const cachedMatches = readCache<{ matches?: Match[] }>(PANEL_KEYS.matches)
  const [events, setEvents] = useState<NearbyEvent[]>(cachedEvents?.events ?? [])
  const [matches, setMatches] = useState<Match[]>(cachedMatches?.matches ?? [])
  const [city, setCity] = useState(cachedEvents?.city ?? "")
  const [preferences, setPreferences] = useState<string[]>(cachedEvents?.preferences ?? [])
  const [message, setMessage] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [posted, setPosted] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(cachedEvents == null)

  useEffect(() => {
    let cancelled = false
    if (readCache(PANEL_KEYS.events) == null) setLoading(true)
    sessionToken(getToken)
      .then(async (token) => {
        const eventsBody = await loadCached(PANEL_KEYS.events, () => listNearbyEvents(token))
        let people: Match[] = []
        try {
          const body = await loadCached(PANEL_KEYS.matches, () => listMatches(token, 50))
          people = body.matches ?? []
        } catch {
          people = []
        }
        return { eventsBody, people }
      })
      .then(({ eventsBody, people }) => {
        if (cancelled) return
        setEvents(eventsBody.events ?? [])
        setMatches(people)
        setCity(eventsBody.city)
        setPreferences(eventsBody.preferences ?? [])
        setMessage(null)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setEvents([])
        setMatches([])
        setMessage(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  async function askToCome(event: NearbyEvent, person: Match) {
    setPlanError(null)
    setBusyId(event.external_id)
    try {
      const token = await sessionToken(getToken)
      const location = event.venue.trim() || event.city.trim()
      await createPlan(token, {
        title: event.title,
        activity_type: "show",
        location_text: location,
        starts_at: event.starts_at ?? undefined,
        capacity: 2,
      })
      invalidatePanels([PANEL_KEYS.plans])
      setPosted((current) => ({ ...current, [event.external_id]: true }))
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Could not post that plan.")
    } finally {
      setBusyId(null)
    }
  }

  const basis = preferences.length ? preferences.join(", ") : "your preferences"

  return (
    <section className="plans" aria-labelledby="events-title">
      <h2 id="events-title">Events near you</h2>
      {loading ? <p className="meta">Looking for events…</p> : null}
      {!loading && message ? <p className="meta">{message}</p> : null}
      {!loading && !message ? (
        <p className="meta">
          Ticketmaster events in {city}, matched to {basis}. Connected accounts add to this list only
          after you keep their suggestions on your profile.
        </p>
      ) : null}
      {!loading && !message && events.length === 0 ? (
        <p className="meta">No upcoming events matched those preferences.</p>
      ) : null}
      {planError ? <p className="meta">{planError}</p> : null}
      <ul className="plan-list">
        {events.map((event) => {
          const when = formatWhen(event.starts_at)
          const person = personForEvent(event, matches)
          const firstName = person?.first_name || "someone"
          return (
            <li key={event.external_id} className="plan">
              <div>
                <h3>{event.title}</h3>
                <p className="meta">
                  {[when, event.venue, event.city].filter(Boolean).join(" · ")}
                </p>
              </div>
              {event.url ? (
                <a href={event.url} target="_blank" rel="noreferrer">
                  Tickets
                </a>
              ) : null}
              {posted[event.external_id] ? (
                <p className="meta">Plan posted</p>
              ) : person ? (
                <button
                  type="button"
                  className="ghost ask"
                  disabled={busyId === event.external_id}
                  onClick={() => askToCome(event, person)}
                >
                  Ask {firstName} to come
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

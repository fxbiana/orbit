import { FormEvent, useEffect, useState } from "react"
import {
  ACTIVITY_TYPES,
  createPlan,
  joinPlan,
  listPlans,
  sessionToken,
  type ActivityType,
  type Plan,
} from "./api"

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  coffee: "Coffee",
  study: "Study",
  workshop: "Workshop",
  other: "Other",
}

function activityLabel(value: string): string {
  if ((ACTIVITY_TYPES as readonly string[]).includes(value)) {
    return ACTIVITY_LABELS[value as ActivityType]
  }
  return value
}

function formatWhen(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function Plans({ getToken }: { getToken: () => Promise<string | null> }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [activityType, setActivityType] = useState<ActivityType>("coffee")
  const [locationText, setLocationText] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [capacity, setCapacity] = useState("")

  async function refresh() {
    const token = await sessionToken(getToken)
    const body = await listPlans(token)
    setPlans(body.plans ?? [])
    setAvailable(true)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .catch(() => {
        if (!cancelled) {
          setAvailable(false)
          setPlans([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmedTitle = title.trim()
    const trimmedLocation = locationText.trim()
    if (!trimmedTitle) {
      setError("Enter a plan title.")
      return
    }
    if (!trimmedLocation) {
      setError("Enter a location.")
      return
    }
    const capacityValue = capacity.trim() === "" ? undefined : Number(capacity)
    if (
      capacityValue != null &&
      (!Number.isInteger(capacityValue) || capacityValue < 2 || capacityValue > 40)
    ) {
      setError("Capacity must be a whole number from 2 to 40.")
      return
    }
    try {
      const token = await sessionToken(getToken)
      const startsValue = startsAt.trim()
      const startsIso =
        startsValue === ""
          ? undefined
          : (() => {
              const parsed = new Date(startsValue)
              return Number.isNaN(parsed.getTime()) ? startsValue : parsed.toISOString()
            })()
      await createPlan(token, {
        title: trimmedTitle,
        activity_type: activityType,
        location_text: trimmedLocation,
        starts_at: startsIso,
        capacity: capacityValue,
      })
      setTitle("")
      setLocationText("")
      setStartsAt("")
      setCapacity("")
      setActivityType("coffee")
      await refresh()
    } catch {
      setAvailable(false)
      setError(null)
    }
  }

  async function onJoin(planId: string) {
    setError(null)
    setBusyId(planId)
    try {
      const token = await sessionToken(getToken)
      await joinPlan(token, planId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that plan.")
    } finally {
      setBusyId(null)
    }
  }

  if (!available) {
    return (
      <section className="plans">
        <h2>Open plans</h2>
        <p className="note">Plans API coming online</p>
      </section>
    )
  }

  return (
    <section className="plans">
      <h2>Open plans</h2>
      <p className="note">
        Post something nearby — coffee, a study session, a workshop — and leave a seat for someone in your orbit.
      </p>

      <form className="plan-form" onSubmit={onCreate}>
        <label htmlFor="plan-title">
          Title
          <input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
          />
        </label>
        <label htmlFor="plan-activity">
          Activity
          <select
            id="plan-activity"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as ActivityType)}
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="plan-location">
          Location
          <input
            id="plan-location"
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            maxLength={80}
          />
        </label>
        <label htmlFor="plan-starts">
          Starts (optional)
          <input
            id="plan-starts"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </label>
        <label htmlFor="plan-capacity">
          Capacity (optional)
          <input
            id="plan-capacity"
            type="number"
            inputMode="numeric"
            min={2}
            max={40}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <span />
          <button type="submit" className="primary">
            Post plan
          </button>
        </div>
      </form>

      {loading ? <p className="note">Loading plans…</p> : null}
      {!loading && plans.length === 0 ? (
        <p className="note">No open plans yet. Be the first to post one.</p>
      ) : null}
      <ul className="plan-list">
        {plans.map((plan) => {
          const when = formatWhen(plan.starts_at)
          const alreadyJoined = plan.viewer_joined === true
          return (
            <li key={plan.id} className="plan">
              <div>
                <h3>{plan.title}</h3>
                <p className="meta">
                  {activityLabel(plan.activity_type)} · {plan.location_text}
                  {when ? ` · ${when}` : ""}
                  {plan.capacity != null ? ` · up to ${plan.capacity}` : ""}
                  {plan.member_count != null ? ` · ${plan.member_count} joined` : ""}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                disabled={alreadyJoined || busyId === plan.id}
                onClick={() => onJoin(plan.id)}
              >
                {alreadyJoined ? "Joined" : busyId === plan.id ? "Joining…" : "Join"}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

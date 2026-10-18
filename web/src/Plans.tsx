import { FormEvent, useEffect, useState } from "react"
import {
  ACTIVITY_TYPES,
  createPlan,
  joinPlan,
  listPlanMatches,
  listPlans,
  sessionToken,
  type ActivityType,
  type Match,
  type Plan,
} from "./api"

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  coffee: "Coffee",
  study: "Study",
  workshop: "Workshop",
  show: "Show",
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

function planShareUrl(planId: string): string {
  return `${window.location.origin}/?plan=${encodeURIComponent(planId)}`
}

function viewerInPlan(plan: Plan): boolean {
  return plan.viewer_joined === true || plan.joined === true
}

function compatibilityLine(match: Match): string {
  const name = match.first_name.trim() || "Someone"
  const reason = match.matched_on.find((item) => item.trim())
  const score = match.compatibility_score
  return reason ? `${name} · ${reason} · ${score}` : `${name} · ${score}`
}

export function Plans({ getToken }: { getToken: () => Promise<string | null> }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [activityType, setActivityType] = useState<ActivityType>("show")
  const [locationText, setLocationText] = useState("")
  const [startsAt, setStartsAt] = useState("")
  const [capacity, setCapacity] = useState("")
  const [fitLines, setFitLines] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

  useEffect(() => {
    const joined = plans.filter(viewerInPlan)
    if (joined.length === 0) {
      setFitLines({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const token = await sessionToken(getToken)
        const next: Record<string, string> = {}
        await Promise.all(
          joined.map(async (plan) => {
            try {
              const matches = await listPlanMatches(token, plan.id)
              const top = matches?.[0]
              if (!top) return
              next[plan.id] = compatibilityLine(top)
            } catch {
              /* Matches stay off the card when the viewer has no profile. */
            }
          }),
        )
        if (!cancelled) setFitLines(next)
      } catch {
        if (!cancelled) setFitLines({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [plans, getToken])

  async function copyShare(planId: string) {
    const url = planShareUrl(planId)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(planId)
    } catch {
      setCopiedId(null)
    }
  }

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
      setActivityType("show")
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
      <p className="note">Posting a show leaves a seat for someone in your orbit.</p>

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
          const alreadyJoined = viewerInPlan(plan)
          const shareUrl = planShareUrl(plan.id)
          const fit = fitLines[plan.id]
          return (
            <li key={plan.id} className="plan" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 16rem", minWidth: 0 }}>
                <h3>{plan.title}</h3>
                <p className="meta">
                  {activityLabel(plan.activity_type)} · {plan.location_text}
                  {when ? ` · ${when}` : ""}
                  {plan.capacity != null ? ` · up to ${plan.capacity}` : ""}
                  {plan.member_count != null ? ` · ${plan.member_count} joined` : ""}
                </p>
                {fit ? <p className="meta">{fit}</p> : null}
                <label className="meta" htmlFor={`plan-share-${plan.id}`}>
                  Come with me
                  <input
                    id={`plan-share-${plan.id}`}
                    readOnly
                    value={shareUrl}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => copyShare(plan.id)}>
                  {copiedId === plan.id ? "Copied" : "Come with me"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={alreadyJoined || busyId === plan.id}
                  onClick={() => onJoin(plan.id)}
                >
                  {alreadyJoined ? "Joined" : busyId === plan.id ? "Joining…" : "Join"}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { useState } from "react"
import { GATHERING_SIZES } from "./onboarding"
import { sampleProfilesFor, VIEWER_PROFILE, type SampleProfile } from "./sampleProfiles"

/** First "Knows …" line, otherwise the first "Wants …" line. */
export function demoReason(matchedOn: readonly string[]): string | null {
  const item =
    matchedOn.find((entry) => entry.startsWith("Knows ")) ??
    matchedOn.find((entry) => entry.startsWith("Wants "))
  if (!item) return null
  if (item.startsWith("Knows ")) return `${item}. You want to learn it.`
  return `${item}. You already know it.`
}

export const DEMO_EVENTS = [
  {
    id: "seed-seattle-dance",
    title: "Dance show",
    venue: "The Crocodile",
    city: "Seattle",
    startsAt: "2026-10-24T02:00:00Z",
  },
  {
    id: "seed-seattle-live",
    title: "Live music gathering",
    venue: "The Vera Project",
    city: "Seattle",
    startsAt: "2026-10-25T02:00:00Z",
  },
] as const

type DemoEvent = (typeof DEMO_EVENTS)[number]

type DemoPlan = {
  id: string
  title: string
  location: string
  startsAt: string
  capacity: number
  memberCount: number
  fit: string
}

function gatheringLabel(value: string): string {
  return GATHERING_SIZES.find((size) => size.value === value)?.label ?? value
}

function formatWhen(value: string): string {
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

function mentionsTitle(person: SampleProfile, title: string): boolean {
  const titleWords = new Set(words(title))
  return person.matched_on.some((reason) => words(reason).some((word) => titleWords.has(word)))
}

export function personForEvent(eventTitle: string, people: SampleProfile[]): SampleProfile | null {
  if (people.length === 0) return null
  const titled = people.filter((person) => mentionsTitle(person, eventTitle))
  const pool = titled.length > 0 ? titled : people
  return pool.reduce((best, person) =>
    person.compatibility_score > best.compatibility_score ? person : best,
  )
}

function fitLine(person: SampleProfile): string {
  const reason = demoReason(person.matched_on)
  return [person.first_name, reason, String(person.compatibility_score)].filter(Boolean).join(" · ")
}

function shareUrl(planId: string): string {
  return `${window.location.origin}/?plan=${planId}`
}

function PersonRow({ person, lead = false }: { person: SampleProfile; lead?: boolean }) {
  const reason = demoReason(person.matched_on)
  const Tag = lead ? "article" : "li"

  return (
    <Tag className={lead ? "person lead" : "person"}>
      <p className={lead ? "stamp" : "score"} aria-label={`Score ${person.compatibility_score}`}>
        {person.compatibility_score}
      </p>
      <div>
        <h3>{person.first_name}</h3>
        {reason ? <p className="reason">{reason}</p> : null}
        <p className="meta">
          {person.location} · {person.age} · {gatheringLabel(person.gathering_size)}
        </p>
      </div>
    </Tag>
  )
}

export function DemoDesk() {
  const [open, setOpen] = useState(false)
  const [posted, setPosted] = useState<Record<string, boolean>>({})
  const [plans, setPlans] = useState<DemoPlan[]>(() => {
    const people = sampleProfilesFor(VIEWER_PROFILE)
    const host = personForEvent("Dance show", people) ?? people[0]
    return host
      ? [
          {
            id: "demo-diwali",
            title: "Diwali dance night",
            location: "Seattle",
            startsAt: "2026-10-24T02:00:00Z",
            capacity: 4,
            memberCount: 1,
            fit: fitLine(host),
          },
        ]
      : []
  })
  const [accepted, setAccepted] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const people = sampleProfilesFor(VIEWER_PROFILE)
  const shown = people.slice(0, 4)
  const top = shown[0]
  const others = shown.slice(1, 4)
  const requester = shown[1] ?? shown[0]

  function askToCome(event: DemoEvent) {
    const person = personForEvent(event.title, people)
    if (!person) return
    setPlans((current) => [
      {
        id: event.id,
        title: event.title,
        location: event.venue,
        startsAt: event.startsAt,
        capacity: 2,
        memberCount: 1,
        fit: fitLine(person),
      },
      ...current.filter((plan) => plan.id !== event.id),
    ])
    setPosted((current) => ({ ...current, [event.id]: true }))
  }

  async function copyShare(planId: string) {
    const url = shareUrl(planId)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* The read-only link stays visible when the clipboard is blocked. */
    }
    setCopiedId(planId)
  }

  return (
    <section className="desk" id="try-seattle">
      <h2>Try it as someone in Seattle</h2>
      <p className="note">
        {`You are in ${VIEWER_PROFILE.location}. You want to learn Spanish and dance. This walkthrough uses the seeded people and shows, with no sign-in.`}
      </p>
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        Try a Seattle profile
      </button>
      {open && top && requester ? (
        <div className="flow">
          <p className="note">Handles stay hidden until both people accept.</p>
          <div className="closest">
            <p className="eyebrow">Your closest match</p>
            <PersonRow person={top} lead />
          </div>
          {others.length > 0 ? (
            <ol className="people">
              {others.map((person) => (
                <PersonRow key={person.id} person={person} />
              ))}
            </ol>
          ) : null}

          <section className="plans" aria-labelledby="demo-events-title">
            <h2 id="demo-events-title">Events near you</h2>
            <p className="meta">Seattle shows you can ask a match to attend.</p>
            <ul className="plan-list">
              {DEMO_EVENTS.map((event) => {
                const person = personForEvent(event.title, people)
                const when = formatWhen(event.startsAt)
                return (
                  <li key={event.id} className="plan">
                    <div>
                      <h3>{event.title}</h3>
                      <p className="meta">{[when, event.venue, event.city].filter(Boolean).join(" · ")}</p>
                    </div>
                    {posted[event.id] ? (
                      <p className="meta">Plan posted</p>
                    ) : person ? (
                      <button type="button" className="ghost ask" onClick={() => askToCome(event)}>
                        Ask {person.first_name} to come
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="plans" aria-labelledby="demo-plans-title">
            <h2 id="demo-plans-title">Open plans</h2>
            <p className="note">Posting a show leaves a seat for someone in your orbit.</p>
            <ul className="plan-list">
              {plans.map((plan) => (
                <li key={plan.id} className="plan">
                  <div>
                    <h3>{plan.title}</h3>
                    <p className="meta">
                      Show · {plan.location} · {formatWhen(plan.startsAt)} · up to {plan.capacity} ·{" "}
                      {plan.memberCount} joined
                    </p>
                    <p className="meta">{plan.fit}</p>
                    <label className="meta" htmlFor={`demo-share-${plan.id}`}>
                      Come with me
                      <input id={`demo-share-${plan.id}`} readOnly value={shareUrl(plan.id)} />
                    </label>
                  </div>
                  <button type="button" className="ghost" onClick={() => void copyShare(plan.id)}>
                    {copiedId === plan.id ? "Copied" : "Come with me"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="reach" id="demo-reach">
            <h2>Reach</h2>
            <p className="note">A match can see a name and a score. A handle opens after you accept.</p>
            {accepted ? (
              <p className="meta">Connected. Instagram @{requester.username}</p>
            ) : (
              <div className="request">
                <h3>{requester.first_name} asked to connect</h3>
                <p className="reason">Thursday, want to try dance?</p>
                <button type="button" className="primary" onClick={() => setAccepted(true)}>
                  Accept
                </button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}

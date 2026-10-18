import { FormEvent, useEffect, useState } from "react"
import { createConnection, listMatches, sessionToken, type Match } from "./api"
import { GATHERING_SIZES, type OnboardingInput } from "./onboarding"
import type { LinkStatus } from "./Reach"

type MatchPerson = {
  id: string
  first_name: string
  location: string
  age: number | null
  gathering_size: string
  compatibility_score: number
  matched_on: string[]
}

function gatheringLabel(value: string): string {
  return GATHERING_SIZES.find((size) => size.value === value)?.label ?? value
}

function leadItem(profile: MatchPerson): string | null {
  return (
    profile.matched_on.find((item) => item.startsWith("Knows ")) ??
    profile.matched_on.find((item) => item.startsWith("Wants ")) ??
    null
  )
}

function primaryReason(profile: MatchPerson): string {
  const item = leadItem(profile)
  if (item?.startsWith("Knows ")) return `${item}. You want to learn it.`
  if (item?.startsWith("Wants ")) return `${item}. You already know it.`
  if (profile.matched_on.length === 0) return "No topic in common."
  return profile.matched_on.join(", ")
}

function fromApi(match: Match): MatchPerson {
  return {
    id: match.user_id,
    first_name: match.first_name,
    location: match.location,
    age: match.age,
    gathering_size: match.gathering_size,
    compatibility_score: match.compatibility_score,
    matched_on: match.matched_on,
  }
}

function ConnectBox({
  person,
  linkStatus,
  onConnect,
}: {
  person: MatchPerson
  linkStatus: LinkStatus | null
  onConnect?: (person: MatchPerson, intro: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [intro, setIntro] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (linkStatus === "accepted") {
    return (
      <p className="meta">
        <a href="#reach">Connected. See how to reach them.</a>
      </p>
    )
  }
  if (linkStatus === "out") return <p className="meta">Request sent.</p>
  if (linkStatus === "in") {
    return (
      <p className="meta">
        <a href="#reach">They asked to connect. Respond in Reach.</a>
      </p>
    )
  }
  if (!onConnect) return null

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!onConnect) return
    setSending(true)
    setError(null)
    try {
      await onConnect(person, intro.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that request.")
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghost ask" onClick={() => setOpen(true)}>
        Ask to connect
      </button>
    )
  }

  return (
    <form className="connect-form" onSubmit={send}>
      <label htmlFor={`intro-${person.id}`}>
        Why you want to meet
        <input
          id={`intro-${person.id}`}
          value={intro}
          maxLength={280}
          placeholder="Thursday, want to try tabla?"
          onChange={(event) => setIntro(event.target.value)}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions">
        <button type="button" className="ghost" onClick={() => setOpen(false)} disabled={sending}>
          Cancel
        </button>
        <button type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  )
}

function PersonRow({
  person,
  lead = false,
  linkStatus = null,
  onConnect,
}: {
  person: MatchPerson
  lead?: boolean
  linkStatus?: LinkStatus | null
  onConnect?: (person: MatchPerson, intro: string) => Promise<void>
}) {
  const reason = primaryReason(person)
  const rest = person.matched_on.filter((item) => item !== leadItem(person))
  const Tag = lead ? "article" : "li"
  const ageLabel = person.age == null ? "—" : String(person.age)

  return (
    <Tag className={lead ? "person lead" : "person"}>
      <p className={lead ? "stamp" : "score"} aria-label={`Score ${person.compatibility_score}`}>
        {person.compatibility_score}
      </p>
      <div>
        <h3>{person.first_name}</h3>
        <p className="reason">{reason}</p>
        {lead && rest.length > 0 ? <p className="also">{rest.join(" · ")}</p> : null}
        <p className="meta">
          {person.location} · {ageLabel} · {gatheringLabel(person.gathering_size)}
        </p>
        <ConnectBox person={person} linkStatus={linkStatus} onConnect={onConnect} />
      </div>
    </Tag>
  )
}

const PAGE_SIZE = 4
const FETCH_LIMIT = 50

export function Matches({
  viewer,
  getToken,
  links = {},
  onConnected,
}: {
  viewer: OnboardingInput
  getToken: () => Promise<string | null>
  links?: Record<string, LinkStatus>
  onConnected?: () => void
}) {
  const [people, setPeople] = useState<MatchPerson[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    sessionToken(getToken)
      .then((token) => listMatches(token, FETCH_LIMIT))
      .then((body) => {
        if (cancelled) return
        setPeople((body.matches ?? []).map(fromApi))
        setPage(0)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPeople([])
        setError(err instanceof Error ? err.message : "Could not load people")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken, viewer])

  async function connect(person: MatchPerson, intro: string) {
    const token = await sessionToken(getToken)
    await createConnection(token, { to_user_id: person.id, intro })
    onConnected?.()
  }

  const pageCount = Math.max(1, Math.ceil(people.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * PAGE_SIZE
  const visible = people.slice(start, start + PAGE_SIZE)
  const top = safePage === 0 ? visible[0] : undefined
  const others = safePage === 0 ? visible.slice(1) : visible
  const heading = viewer.first_name ? `${viewer.first_name}, people near you` : "People near you"
  const range =
    people.length === 0 ? "" : `Showing ${start + 1}-${start + visible.length} of ${people.length}`

  return (
    <section className="matches">
      <h2>{heading}</h2>
      <p className="note">
        {loading
          ? "Looking for people who fit you."
          : error
            ? null
            : people.length === 0
              ? "No one else has a profile yet. When someone finishes theirs, they will show up here."
              : people.length > PAGE_SIZE
                ? `Start with the closest four. ${range}, highest score first.`
                : `Start with the person at the top. ${people.length} shown, highest score first.`}
      </p>
      {error ? <p className="error">Could not load people. {error}</p> : null}
      {top ? (
        <div className="closest">
          <p className="eyebrow">Your closest match</p>
          <PersonRow person={top} lead linkStatus={links[top.id] ?? null} onConnect={connect} />
        </div>
      ) : null}
      <ol className="people">
        {others.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            linkStatus={links[person.id] ?? null}
            onConnect={connect}
          />
        ))}
      </ol>
      {people.length > PAGE_SIZE ? (
        <nav className="pager" aria-label="More people">
          <button
            type="button"
            className="ghost"
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <p className="meta">
            Page {safePage + 1} of {pageCount}
          </p>
          <button
            type="button"
            className="ghost"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}

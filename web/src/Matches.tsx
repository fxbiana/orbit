import { useEffect, useState } from "react"
import { listMatches, sessionToken, type Match } from "./api"
import { GATHERING_SIZES, type OnboardingInput } from "./onboarding"
import { sampleProfilesFor, type SampleProfile } from "./sampleProfiles"

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
    profile.matched_on.find((item) => item.toLocaleLowerCase() === "knows dance") ??
    profile.matched_on.find((item) => item.toLocaleLowerCase().includes("dance")) ??
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

function fromSample(profile: SampleProfile): MatchPerson {
  return {
    id: profile.id,
    first_name: profile.first_name,
    location: profile.location,
    age: profile.age,
    gathering_size: profile.gathering_size,
    compatibility_score: profile.compatibility_score,
    matched_on: profile.matched_on,
  }
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

function PersonRow({ person, lead = false }: { person: MatchPerson; lead?: boolean }) {
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
      </div>
    </Tag>
  )
}

const TOP_MATCHES = 10

function samplePeople(viewer: OnboardingInput): { people: MatchPerson[]; total: number } {
  const ranked = sampleProfilesFor(viewer)
  return {
    people: ranked.slice(0, TOP_MATCHES).map(fromSample),
    total: ranked.length,
  }
}

export function Matches({
  viewer,
  getToken,
}: {
  viewer: OnboardingInput
  getToken: () => Promise<string | null>
}) {
  const initial = samplePeople(viewer)
  const [people, setPeople] = useState<MatchPerson[]>(initial.people)
  const [source, setSource] = useState<"sample" | "api">("sample")
  const [total, setTotal] = useState(initial.total)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    sessionToken(getToken)
      .then((token) => listMatches(token, TOP_MATCHES))
      .then((body) => {
        if (cancelled) return
        const apiPeople = (body.matches ?? []).map(fromApi)
        if (apiPeople.length === 0) {
          const fallback = samplePeople(viewer)
          setPeople(fallback.people)
          setTotal(fallback.total)
          setSource("sample")
          return
        }
        setPeople(apiPeople)
        setTotal(apiPeople.length)
        setSource("api")
      })
      .catch(() => {
        if (cancelled) return
        const fallback = samplePeople(viewer)
        setPeople(fallback.people)
        setTotal(fallback.total)
        setSource("sample")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken, viewer])

  const top = people[0]
  const others = people.slice(1)
  const heading =
    source === "api" && viewer.first_name
      ? `${viewer.first_name}, people near you`
      : source === "api"
        ? "People near you"
        : "Showing sample people"

  return (
    <section className="matches">
      <h2>{heading}</h2>
      <p className="note">
        {loading ? "Looking for people who fit you… " : null}
        Start with the person at the top. {people.length}
        {source === "sample" ? ` of ${total}` : ""} shown, highest score first. 40 points when they
        know something you want to learn. City, gathering size, and age add the rest, up to 100.
      </p>
      {top ? (
        <div className="closest">
          <p className="eyebrow">Your closest match</p>
          <PersonRow person={top} lead />
        </div>
      ) : null}
      <ol className="people">
        {others.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ol>
    </section>
  )
}

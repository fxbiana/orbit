import { GATHERING_SIZES, type OnboardingInput } from "./onboarding"
import { sampleProfilesFor, type SampleProfile } from "./sampleProfiles"

function gatheringLabel(value: string): string {
  return GATHERING_SIZES.find((size) => size.value === value)?.label ?? value
}

function leadItem(profile: SampleProfile): string | null {
  return (
    profile.matched_on.find((item) => item.toLocaleLowerCase() === "knows dance") ??
    profile.matched_on.find((item) => item.toLocaleLowerCase().includes("dance")) ??
    profile.matched_on.find((item) => item.startsWith("Knows ")) ??
    profile.matched_on.find((item) => item.startsWith("Wants ")) ??
    null
  )
}

function primaryReason(profile: SampleProfile): string {
  const item = leadItem(profile)
  if (item?.startsWith("Knows ")) return `${item}. You want to learn it.`
  if (item?.startsWith("Wants ")) return `${item}. You already know it.`
  if (profile.matched_on.length === 0) return "No topic in common."
  return profile.matched_on.join(", ")
}

function PersonRow({ person, lead = false }: { person: SampleProfile; lead?: boolean }) {
  const reason = primaryReason(person)
  const rest = person.matched_on.filter((item) => item !== leadItem(person))
  const Tag = lead ? "article" : "li"

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
          {person.location} · {person.age} · {gatheringLabel(person.gathering_size)}
        </p>
      </div>
    </Tag>
  )
}

export function Matches({ viewer }: { viewer: OnboardingInput }) {
  const people = sampleProfilesFor(viewer)
  const top = people[0]
  const others = people.slice(1)

  return (
    <section className="matches">
      <h2>People who fit you</h2>
      <p className="note">
        {people.length} people, highest score first. 40 points when they know something you want to
        learn. City, gathering size, and age add the rest, up to 100.
      </p>
      {top ? <PersonRow person={top} lead /> : null}
      <ol className="people">
        {others.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </ol>
    </section>
  )
}

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react"
import { getContact, getOnboarding, saveContact, saveOnboarding, sessionToken } from "./api"
import { Matches } from "./Matches"
import { Plans } from "./Plans"
import {
  ContactForm,
  Reach,
  ReachFields,
  contactProblem,
  contactToSave,
  type ContactDraft,
  type LinkStatus,
} from "./Reach"
import {
  FLOW_STEPS,
  GATHERING_SIZES,
  ONBOARDING_LIMITS,
  PROFILE_FIELDS,
  TOPIC_KEYS,
  cleanText,
  formatList,
  parseList,
  validateFlowStep,
  validateOnboarding,
  type FlowStepId,
  type OnboardingInput,
  type TopicKey,
} from "./onboarding"
type TopicDraft = { knows: string; wants: string }

type Draft = {
  username: string
  firstName: string
  location: string
  age: string
  gatheringSize: string
  topics: Record<TopicKey, TopicDraft>
}

const EMPTY_CONTACT: ContactDraft = {
  instagram: "",
  discord: "",
  snapchat: "",
  preferred: "",
  reach_note: "",
}

function emptyDraft(): Draft {
  const topics = {} as Record<TopicKey, TopicDraft>
  for (const key of TOPIC_KEYS) {
    topics[key] = { knows: "", wants: "" }
  }
  return {
    username: "",
    firstName: "",
    location: "",
    age: "",
    gatheringSize: "",
    topics,
  }
}

function draftFromProfile(profile: OnboardingInput): Draft {
  const topics = {} as Record<TopicKey, TopicDraft>
  for (const key of TOPIC_KEYS) {
    topics[key] = {
      knows: formatList(profile[key].knows),
      wants: formatList(profile[key].wants_to_learn),
    }
  }
  return {
    username: profile.username,
    firstName: profile.first_name,
    location: profile.location,
    age: String(profile.age),
    gatheringSize: profile.gathering_size,
    topics,
  }
}

function toInput(draft: Draft): OnboardingInput {
  const ageText = draft.age.trim()
  const age = ageText === "" ? Number.NaN : Number(ageText)
  const input = {
    username: cleanText(draft.username),
    first_name: cleanText(draft.firstName),
    location: cleanText(draft.location),
    age: Number.isInteger(age) ? age : Number.NaN,
    gathering_size: draft.gatheringSize,
  } as OnboardingInput
  for (const key of TOPIC_KEYS) {
    input[key] = {
      knows: parseList(draft.topics[key].knows),
      wants_to_learn: parseList(draft.topics[key].wants),
    }
  }
  return input
}

function ProfilePanel({
  getToken,
  saveError,
  onClose,
  onEdit,
}: {
  getToken: () => Promise<string | null>
  saveError: string | null
  onClose: () => void
  onEdit: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <button type="button" className="profile-backdrop" aria-label="Close contact ways" onClick={onClose} />
      <section className="profile-pop" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="profile-pop-head">
          <h2 id="profile-title">Contact ways</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <ContactForm
          getToken={getToken}
          sideAction={
            <button type="button" className="ghost" onClick={onEdit}>
              Edit profile
            </button>
          }
        />
        {saveError ? <p className="error">Profile was not saved. {saveError}</p> : null}
      </section>
    </>
  )
}

export function OnboardingForm({
  getToken,
  extras,
  profileOpen = false,
  onProfileClose,
}: {
  getToken: () => Promise<string | null>
  extras?: ReactNode
  profileOpen?: boolean
  onProfileClose?: () => void
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT)
  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState<"pages" | "people">("pages")
  const [viewer, setViewer] = useState<OnboardingInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [reachKey, setReachKey] = useState(0)
  const [profileDismissed, setProfileDismissed] = useState(false)
  const [links, setLinks] = useState<Record<string, LinkStatus>>({})
  const onLinks = useCallback((next: Record<string, LinkStatus>) => {
    setLinks(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    sessionToken(getToken)
      .then(async (token) => {
        const [profile, storedContact] = await Promise.all([
          getOnboarding(token),
          getContact(token).catch(() => null),
        ])
        return { profile, storedContact }
      })
      .then(({ profile, storedContact }) => {
        if (cancelled) return
        if (storedContact) {
          setContact({
            instagram: storedContact.instagram,
            discord: storedContact.discord,
            snapchat: storedContact.snapchat,
            preferred: storedContact.preferred,
            reach_note: storedContact.reach_note,
          })
        }
        if (!profile) return
        setDraft(draftFromProfile(profile))
        setViewer(profile)
        setPhase("people")
      })
      .catch((err: Error) => {
        if (!cancelled) setSaveError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  useEffect(() => {
    if (profileOpen) setProfileDismissed(false)
  }, [profileOpen])

  const step = FLOW_STEPS[stepIndex] ?? FLOW_STEPS[0]
  const topic = PROFILE_FIELDS.find((field) => field.key === step.id)

  function closeProfile() {
    setProfileDismissed(true)
    onProfileClose?.()
  }

  function editProfile() {
    closeProfile()
    setError(null)
    setStepIndex(0)
    setPhase("pages")
  }

  const profilePanel =
    loaded && profileOpen && !profileDismissed ? (
      <ProfilePanel getToken={getToken} saveError={saveError} onClose={closeProfile} onEdit={editProfile} />
    ) : null

  if (!loaded) {
    return <p className="note">Loading your profile...</p>
  }

  function updateTopic(key: TopicKey, side: keyof TopicDraft, value: string) {
    setDraft((current) => ({
      ...current,
      topics: {
        ...current.topics,
        [key]: { ...current.topics[key], [side]: value },
      },
    }))
  }

  function problemFor(id: FlowStepId): string | null {
    if (id === "reach") return contactProblem(contact)
    return validateFlowStep(id, toInput(draft))
  }

  function goNext(event: FormEvent) {
    event.preventDefault()
    const problem = problemFor(step.id)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setStepIndex((current) => Math.min(current + 1, FLOW_STEPS.length - 1))
  }

  async function finish(event: FormEvent) {
    event.preventDefault()
    const input = toInput(draft)
    const problem = validateOnboarding(input)
    if (problem) {
      setError(problem)
      return
    }

    const reachProblem = contactProblem(contact)
    if (reachProblem) {
      setError(reachProblem)
      return
    }

    setError(null)
    setSaveError(null)
    try {
      const token = await sessionToken(getToken)
      await saveOnboarding(token, input)
      await saveContact(token, contactToSave(contact))
      setViewer(input)
      setPhase("people")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    }
  }

  if (phase === "people" && viewer) {
    return (
      <div className="flow">
        <Matches
          viewer={viewer}
          getToken={getToken}
          links={links}
          onConnected={() => setReachKey((key) => key + 1)}
        />
        {profilePanel}
        <Reach getToken={getToken} refreshKey={reachKey} onLinks={onLinks} />
        <Plans getToken={getToken} />
        {extras ? (
          <details className="tickets">
            <summary>Saved pages</summary>
            {extras}
          </details>
        ) : null}
      </div>
    )
  }

  const last = stepIndex === FLOW_STEPS.length - 1

  return (
    <>
    {profilePanel}
    <form className="flow onboarding" onSubmit={last ? finish : goNext}>
      <p className="step-count">
        Step {stepIndex + 1} of {FLOW_STEPS.length}
      </p>
      <div className="track" aria-hidden="true">
        {FLOW_STEPS.map((item, index) => (
          <span
            key={item.id}
            className={index < stepIndex ? "done" : index === stepIndex ? "now" : undefined}
          />
        ))}
      </div>
      <h2>{step.title}</h2>
      {stepIndex === 0 ? (
        <p className="note">
          Welcome. A few answers is enough to find your people.
        </p>
      ) : null}
      {topic ? <p className="note">Separate items with commas.</p> : null}
      {step.id === "reach" ? (
        <p className="note">
          Optional. Usernames only. Connected people can see this, and you can change it later from
          Contact ways in the account menu.
        </p>
      ) : null}

      {step.id === "you" ? (
        <>
          <label htmlFor="username">
            User name
            <input
              id="username"
              name="username"
              value={draft.username}
              autoComplete="nickname"
              onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
            />
          </label>
          <label htmlFor="first-name">
            First name
            <input
              id="first-name"
              name="given-name"
              value={draft.firstName}
              autoComplete="given-name"
              onChange={(event) => setDraft((current) => ({ ...current, firstName: event.target.value }))}
            />
          </label>
          <label htmlFor="age">
            Age
            <input
              id="age"
              name="age"
              type="number"
              inputMode="numeric"
              min={ONBOARDING_LIMITS.ageMin}
              max={ONBOARDING_LIMITS.ageMax}
              value={draft.age}
              onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))}
            />
          </label>
        </>
      ) : null}

      {step.id === "where" ? (
        <label htmlFor="location">
          Location
          <input
            id="location"
            name="location"
            value={draft.location}
            autoComplete="address-level2"
            onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
          />
        </label>
      ) : null}

      {step.id === "gathering" ? (
        <fieldset className="choices">
          <legend>Group size you want</legend>
          {GATHERING_SIZES.map((size) => (
            <label key={size.value} className="choice">
              <input
                type="radio"
                name="gathering-size"
                value={size.value}
                checked={draft.gatheringSize === size.value}
                onChange={() => setDraft((current) => ({ ...current, gatheringSize: size.value }))}
              />
              {size.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {step.id === "reach" ? <ReachFields draft={contact} onChange={setContact} /> : null}

      {topic ? (
        <>
          <label htmlFor={`${topic.key}-knows`}>
            {topic.knows}
            <input
              id={`${topic.key}-knows`}
              value={draft.topics[topic.key].knows}
              onChange={(event) => updateTopic(topic.key, "knows", event.target.value)}
            />
          </label>
          <label htmlFor={`${topic.key}-wants`}>
            {topic.wants}
            <input
              id={`${topic.key}-wants`}
              value={draft.topics[topic.key].wants}
              onChange={(event) => updateTopic(topic.key, "wants", event.target.value)}
            />
          </label>
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      <div className="actions">
        {stepIndex > 0 ? (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setError(null)
              setStepIndex((current) => current - 1)
            }}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="primary">
          {last ? "Find your people" : "Next"}
        </button>
      </div>
    </form>
    </>
  )
}

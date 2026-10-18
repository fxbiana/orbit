import { FormEvent, ReactNode, useEffect, useState } from "react"
import { getOnboarding, saveOnboarding, sessionToken } from "./api"
import { Matches } from "./Matches"
import { Plans } from "./Plans"
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
import { VIEWER_PROFILE } from "./sampleProfiles"

type TopicDraft = { knows: string; wants: string }

type Draft = {
  username: string
  firstName: string
  location: string
  age: string
  gatheringSize: string
  topics: Record<TopicKey, TopicDraft>
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

export function OnboardingForm({
  getToken,
  extras,
}: {
  getToken: () => Promise<string | null>
  extras?: ReactNode
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(VIEWER_PROFILE))
  const [stepIndex, setStepIndex] = useState(0)
  const [phase, setPhase] = useState<"pages" | "people">("pages")
  const [viewer, setViewer] = useState<OnboardingInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    sessionToken(getToken)
      .then((token) => getOnboarding(token))
      .then((profile) => {
        if (cancelled || !profile) return
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

  const step = FLOW_STEPS[stepIndex] ?? FLOW_STEPS[0]
  const topic = PROFILE_FIELDS.find((field) => field.key === step.id)

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

    setError(null)
    setSaveError(null)
    setViewer(input)
    setPhase("people")
    try {
      await saveOnboarding(await sessionToken(getToken), input)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    }
  }

  if (phase === "people" && viewer) {
    return (
      <div className="flow">
        <Matches viewer={viewer} getToken={getToken} />
        <Plans getToken={getToken} />
        {saveError ? <p className="error">Profile was not saved. {saveError}</p> : null}
        <div className="actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setStepIndex(0)
              setPhase("pages")
            }}
          >
            Edit answers
          </button>
        </div>
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
    <form className="flow onboarding" onSubmit={last ? finish : goNext}>
      <p className="step-count">
        {stepIndex + 1} of {FLOW_STEPS.length}
      </p>
      <h2>{step.title}</h2>
      {stepIndex === 0 ? (
        <p className="note">
          Tell Orbit enough to find your people. Answers are filled in so you can click through —
          change any of them.
        </p>
      ) : null}
      {topic ? <p className="note">Separate items with commas.</p> : null}

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
  )
}

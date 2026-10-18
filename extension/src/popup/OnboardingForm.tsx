import { FormEvent, useEffect, useState } from "react"
import { getOnboarding, saveOnboarding } from "./api"
import {
  GATHERING_SIZES,
  ONBOARDING_LIMITS,
  PROFILE_FIELDS,
  TOPIC_KEYS,
  cleanText,
  formatList,
  parseList,
  validateOnboarding,
  type OnboardingInput,
  type OnboardingProfile,
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

function blankDraft(): Draft {
  const topics = {} as Record<TopicKey, TopicDraft>
  for (const key of TOPIC_KEYS) topics[key] = { knows: "", wants: "" }
  return { username: "", firstName: "", location: "", age: "", gatheringSize: "", topics }
}

function draftFromProfile(profile: OnboardingProfile): Draft {
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
    age: profile.age == null ? "" : String(profile.age),
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

export function OnboardingForm({ userId }: { userId: string }) {
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getOnboarding(userId)
      .then((profile) => {
        if (cancelled) return
        if (profile) setDraft(draftFromProfile(profile))
        setReady(true)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  function updateTopic(key: TopicKey, side: keyof TopicDraft, value: string) {
    setSaved(false)
    setDraft((current) => ({
      ...current,
      topics: {
        ...current.topics,
        [key]: { ...current.topics[key], [side]: value },
      },
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const input = toInput(draft)
    const problem = validateOnboarding(input)
    if (problem) {
      setError(problem)
      setSaved(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const profile = await saveOnboarding(userId, input)
      setDraft(draftFromProfile(profile))
      setSaved(true)
    } catch (err) {
      setSaved(false)
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="onboarding" onSubmit={save}>
      <h2>Profile</h2>
      <p className="note">
        {ready
          ? "Add what you know and what you want to learn. Separate items with commas. Someone who knows Diwali can be matched with someone who wants to learn it."
          : "Loading profile..."}
      </p>
      <label htmlFor="username">
        User name
        <input
          id="username"
          name="username"
          value={draft.username}
          disabled={!ready || saving}
          autoComplete="nickname"
          onChange={(event) => {
            setSaved(false)
            setDraft((current) => ({ ...current, username: event.target.value }))
          }}
        />
      </label>
      <label htmlFor="first-name">
        First name
        <input
          id="first-name"
          name="given-name"
          value={draft.firstName}
          disabled={!ready || saving}
          autoComplete="given-name"
          onChange={(event) => {
            setSaved(false)
            setDraft((current) => ({ ...current, firstName: event.target.value }))
          }}
        />
      </label>
      <label htmlFor="location">
        Location
        <input
          id="location"
          name="location"
          value={draft.location}
          disabled={!ready || saving}
          autoComplete="address-level2"
          placeholder="Seattle"
          onChange={(event) => {
            setSaved(false)
            setDraft((current) => ({ ...current, location: event.target.value }))
          }}
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
          disabled={!ready || saving}
          onChange={(event) => {
            setSaved(false)
            setDraft((current) => ({ ...current, age: event.target.value }))
          }}
        />
      </label>
      <label htmlFor="gathering-size">
        Gathering size
        <select
          id="gathering-size"
          name="gathering-size"
          value={draft.gatheringSize}
          disabled={!ready || saving}
          onChange={(event) => {
            setSaved(false)
            setDraft((current) => ({ ...current, gatheringSize: event.target.value }))
          }}
        >
          <option value="">Choose a size</option>
          {GATHERING_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {size.label}
            </option>
          ))}
        </select>
      </label>
      {PROFILE_FIELDS.map((topic) => (
        <fieldset key={topic.key} disabled={!ready || saving}>
          <legend>{topic.title}</legend>
          <label htmlFor={`${topic.key}-knows`}>
            {topic.knows}
            <input
              id={`${topic.key}-knows`}
              value={draft.topics[topic.key].knows}
              placeholder={topic.knowsHint}
              onChange={(event) => updateTopic(topic.key, "knows", event.target.value)}
            />
          </label>
          <label htmlFor={`${topic.key}-wants`}>
            {topic.wants}
            <input
              id={`${topic.key}-wants`}
              value={draft.topics[topic.key].wants}
              placeholder={topic.wantsHint}
              onChange={(event) => updateTopic(topic.key, "wants", event.target.value)}
            />
          </label>
        </fieldset>
      ))}
      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="saved">Profile saved.</p> : null}
      <button type="submit" disabled={!ready || saving}>
        {saving ? "Saving..." : "Save profile"}
      </button>
    </form>
  )
}

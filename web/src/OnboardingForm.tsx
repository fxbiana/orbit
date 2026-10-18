import { FormEvent, Fragment, ReactNode, useCallback, useEffect, useState } from "react"
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
  cleanText,
  formatList,
  parseList,
  validateFlowStep,
  validateOnboarding,
  type FlowStepId,
  type Knowledge,
  type OnboardingInput,
  type TopicKey,
} from "./onboarding"
import { importSpotify, type SpotifySuggestions } from "./spotify"

type TopicDraft = { knows: string; wants: string }

type Draft = {
  username: string
  firstName: string
  location: string
  age: string
  gatheringSize: string
  languages: TopicDraft
  hobbies: TopicDraft
  locations: TopicDraft
  interests: TopicDraft
  festivals: TopicDraft
}

const PREFERENCE_KEYS = ["hobbies", "locations", "interests", "festivals"] as const satisfies readonly TopicKey[]

const EMPTY_CONTACT: ContactDraft = {
  instagram: "",
  discord: "",
  snapchat: "",
  facebook: "",
  preferred: "",
  reach_note: "",
}

const languageField = PROFILE_FIELDS.find((field) => field.key === "languages") ?? PROFILE_FIELDS[0]

function emptyTopic(): TopicDraft {
  return { knows: "", wants: "" }
}

function topicText(topic: Knowledge): TopicDraft {
  return {
    knows: formatList(topic.knows),
    wants: formatList(topic.wants_to_learn),
  }
}

function parsedTopic(topic: TopicDraft): Knowledge {
  return {
    knows: parseList(topic.knows),
    wants_to_learn: parseList(topic.wants),
  }
}

function emptyDraft(): Draft {
  return {
    username: "",
    firstName: "",
    location: "",
    age: "",
    gatheringSize: "",
    languages: emptyTopic(),
    hobbies: emptyTopic(),
    locations: emptyTopic(),
    interests: emptyTopic(),
    festivals: emptyTopic(),
  }
}

function draftFromProfile(profile: OnboardingInput): Draft {
  return {
    username: profile.username,
    firstName: profile.first_name,
    location: profile.location,
    age: String(profile.age),
    gatheringSize: profile.gathering_size,
    languages: topicText(profile.languages),
    hobbies: topicText(profile.hobbies),
    locations: topicText(profile.locations),
    interests: topicText(profile.interests),
    festivals: topicText(profile.festivals),
  }
}

function toInput(draft: Draft): OnboardingInput {
  const ageText = draft.age.trim()
  const age = ageText === "" ? Number.NaN : Number(ageText)
  return {
    username: cleanText(draft.username),
    first_name: cleanText(draft.firstName),
    location: cleanText(draft.location),
    age: Number.isInteger(age) ? age : Number.NaN,
    gathering_size: draft.gatheringSize,
    languages: parsedTopic(draft.languages),
    hobbies: parsedTopic(draft.hobbies),
    locations: parsedTopic(draft.locations),
    interests: parsedTopic(draft.interests),
    festivals: parsedTopic(draft.festivals),
  }
}

function mergeCommaList(current: string, incoming: string[]): string {
  return formatList(parseList(`${current},${incoming.join(",")}`))
}

function mergeTopicDraft(current: TopicDraft, incoming: SpotifySuggestions[TopicKey]): TopicDraft {
  return {
    knows: mergeCommaList(current.knows, incoming.knows),
    wants: mergeCommaList(current.wants, incoming.wants_to_learn),
  }
}

function spotifySummaryText(genres: string[], artists: { name: string }[]): string {
  if (genres.length > 0) return `Spotify suggested: ${genres.join(", ")}`
  const names = artists.map((artist) => artist.name.trim()).filter((name) => name.length > 0)
  if (names.length > 0) return `Spotify suggested artists: ${names.join(", ")}`
  return "Spotify did not find genres to suggest."
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
  const [spotifySummary, setSpotifySummary] = useState<string | null>(null)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [spotifyBusy, setSpotifyBusy] = useState(false)
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
            facebook: storedContact.facebook,
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
      [key]: { ...current[key], [side]: value },
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

  async function suggestFromSpotify() {
    setSpotifyError(null)
    setSpotifyBusy(true)
    try {
      const result = await importSpotify(getToken)
      setDraft((current) => ({
        ...current,
        languages: mergeTopicDraft(current.languages, result.suggestions.languages),
        hobbies: mergeTopicDraft(current.hobbies, result.suggestions.hobbies),
        locations: mergeTopicDraft(current.locations, result.suggestions.locations),
        interests: mergeTopicDraft(current.interests, result.suggestions.interests),
        festivals: mergeTopicDraft(current.festivals, result.suggestions.festivals),
      }))
      setSpotifySummary(spotifySummaryText(result.genres, result.artists))
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : "Spotify import failed")
    } finally {
      setSpotifyBusy(false)
    }
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
    // Save before opening Matches/Plans. Those routes need the profile to exist;
    // flipping phase first caused GET /api/matches to 404 while PUT was still in flight.
    try {
      const token = await sessionToken(getToken)
      await saveOnboarding(token, input)
      await saveContact(token, contactToSave(contact))
      setViewer(input)
      setPhase("people")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    }
    setViewer(input)
    setPhase("people")
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
      {step.id === "reach" ? (
        <p className="note">
          You choose what to share: Instagram, Discord, Snapchat, or Facebook. Nothing here is scraped.
          Spotify comes on the next screen.
        </p>
      ) : null}
      {step.id === "preferences" ? (
        <p className="note">
          Hobbies, places, interests, and festivals each have their own list. Separate items with
          commas. Where you live is on the next screen.
        </p>
      ) : null}
      {step.id === "about" ? (
        <p className="note">Orbit does not pull your name or location from connected accounts.</p>
      ) : null}

      {step.id === "reach" ? <ReachFields draft={contact} onChange={setContact} /> : null}

      {step.id === "preferences" ? (
        <>
          <label htmlFor="languages-knows">
            {languageField.knows}
            <input
              id="languages-knows"
              value={draft.languages.knows}
              onChange={(event) => updateTopic("languages", "knows", event.target.value)}
            />
          </label>
          <label htmlFor="languages-wants">
            {languageField.wants}
            <input
              id="languages-wants"
              value={draft.languages.wants}
              onChange={(event) => updateTopic("languages", "wants", event.target.value)}
            />
          </label>
          {PREFERENCE_KEYS.map((key) => {
            const field = PROFILE_FIELDS.find((item) => item.key === key)
            if (!field) return null
            return (
              <Fragment key={key}>
                <label htmlFor={`${key}-knows`}>
                  {field.knows}
                  <input
                    id={`${key}-knows`}
                    value={draft[key].knows}
                    onChange={(event) => updateTopic(key, "knows", event.target.value)}
                  />
                </label>
                <label htmlFor={`${key}-wants`}>
                  {field.wants}
                  <input
                    id={`${key}-wants`}
                    value={draft[key].wants}
                    onChange={(event) => updateTopic(key, "wants", event.target.value)}
                  />
                </label>
              </Fragment>
            )
          })}
          <button
            type="button"
            className="ghost"
            disabled={spotifyBusy}
            onClick={() => void suggestFromSpotify()}
          >
            {spotifyBusy ? "Suggesting…" : "Suggest from Spotify"}
          </button>
          {spotifySummary ? <p className="note">{spotifySummary}</p> : null}
          {spotifyError ? <p className="error">{spotifyError}</p> : null}
        </>
      ) : null}

      {step.id === "about" ? (
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

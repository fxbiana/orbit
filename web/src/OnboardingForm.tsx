import { FormEvent, Fragment, ReactNode, useCallback, useEffect, useState } from "react"
import { getContact, getOnboarding, saveContact, saveOnboarding, sessionToken } from "./api"
import { Matches } from "./Matches"
import { NearbyEvents } from "./NearbyEvents"
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
  INTEREST_STARTERS,
  ONBOARDING_LIMITS,
  PROFILE_FIELDS,
  TOPIC_KEYS,
  cleanText,
  formatList,
  parseListPreserving,
  validateFlowStep,
  validateOnboarding,
  type FlowStepId,
  type Knowledge,
  type OnboardingInput,
  type TopicKey,
} from "./onboarding"
import { CityMap } from "./CityMap"
import { SpotifyConnect } from "./SpotifyConnect"
import { importMeta } from "./meta"
import { importSpotify, type SpotifyArtist, type SpotifySuggestions } from "./spotify"

function artistInitials(name: string): string {
  const parts = name.split(/[\s,]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "")
  return letters.join("") || "•"
}

function ArtistCard({ artist }: { artist: SpotifyArtist }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(artist.imageUrl) && !failed
  return (
    <li>
      {showImage ? (
        <img src={artist.imageUrl ?? undefined} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="artist-fallback" aria-hidden="true">
          {artistInitials(artist.name)}
        </span>
      )}
      <span className="artist-name">{artist.name}</span>
    </li>
  )
}

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
  kept: string[]
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

const DESK_TABS = [
  { id: "people", label: "People" },
  { id: "reach", label: "Reach" },
  { id: "events", label: "Events" },
  { id: "plans", label: "Plans" },
  { id: "pages", label: "Saved pages" },
] as const

type DeskTab = (typeof DESK_TABS)[number]["id"]

function emptyTopic(): TopicDraft {
  return { knows: "", wants: "" }
}

function topicText(topic: Knowledge): TopicDraft {
  return {
    knows: formatList(topic.knows),
    wants: formatList(topic.wants_to_learn),
  }
}

function parsedTopic(topic: TopicDraft, kept: readonly string[]): Knowledge {
  return {
    knows: parseListPreserving(topic.knows, kept),
    wants_to_learn: parseListPreserving(topic.wants, kept),
  }
}

function phrasesWithCommas(profile: OnboardingInput): string[] {
  const phrases: string[] = []
  for (const key of TOPIC_KEYS) {
    phrases.push(...profile[key].knows, ...profile[key].wants_to_learn)
  }
  return phrases.filter((item) => item.includes(","))
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
    kept: [],
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
    kept: phrasesWithCommas(profile),
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
    languages: parsedTopic(draft.languages, draft.kept),
    hobbies: parsedTopic(draft.hobbies, draft.kept),
    locations: parsedTopic(draft.locations, draft.kept),
    interests: parsedTopic(draft.interests, draft.kept),
    festivals: parsedTopic(draft.festivals, draft.kept),
  }
}

function mergeCommaList(current: string, incoming: string[], kept: readonly string[]): string {
  const merged = parseListPreserving(current, kept)
  const seen = new Set(merged.map((item) => item.toLocaleLowerCase()))
  for (const item of incoming) {
    const text = cleanText(item)
    const key = text.toLocaleLowerCase()
    if (!text || seen.has(key)) continue
    if (merged.length >= ONBOARDING_LIMITS.list) break
    seen.add(key)
    merged.push(text)
  }
  return formatList(merged)
}

function withKept(kept: string[], incoming: string[]): string[] {
  const seen = new Set(kept.map((item) => item.toLocaleLowerCase()))
  const next = [...kept]
  for (const item of incoming) {
    const text = cleanText(item)
    if (!text.includes(",") || seen.has(text.toLocaleLowerCase())) continue
    seen.add(text.toLocaleLowerCase())
    next.push(text)
  }
  return next
}

function mergeTopicDraft(
  current: TopicDraft,
  incoming: SpotifySuggestions[TopicKey],
  kept: readonly string[],
): TopicDraft {
  return {
    knows: mergeCommaList(current.knows, incoming.knows, kept),
    wants: mergeCommaList(current.wants, incoming.wants_to_learn, kept),
  }
}

function suggestionItems(suggestions: SpotifySuggestions): string[] {
  const items: string[] = []
  for (const topic of TOPIC_KEYS) {
    items.push(...suggestions[topic].knows, ...suggestions[topic].wants_to_learn)
  }
  return items
}

const TOP_ARTISTS = 5

function spotifySummaryText(genres: string[], artists: { name: string }[]): string | null {
  const names = new Set(
    artists.map((artist) => artist.name.trim().toLocaleLowerCase()).filter((name) => name.length > 0),
  )
  const namedArtists =
    artists.length > 0 && genres.length > 0 && genres.every((genre) => names.has(genre.trim().toLocaleLowerCase()))
  if (namedArtists) return null
  if (genres.length > 0) return `Spotify suggested: ${genres.join(", ")}`
  if (artists.some((artist) => artist.name.trim().length > 0)) return null
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
  const [desk, setDesk] = useState<DeskTab>("people")
  const [viewer, setViewer] = useState<OnboardingInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [reachKey, setReachKey] = useState(0)
  const [profileDismissed, setProfileDismissed] = useState(false)
  const [links, setLinks] = useState<Record<string, LinkStatus>>({})
  const [spotifyGenres, setSpotifyGenres] = useState<string[]>([])
  const [spotifyArtists, setSpotifyArtists] = useState<SpotifyArtist[]>([])
  const [spotifySummary, setSpotifySummary] = useState<string | null>(null)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [spotifyBusy, setSpotifyBusy] = useState(false)
  const [metaBusy, setMetaBusy] = useState(false)
  const [metaSummary, setMetaSummary] = useState<string | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
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
      setDraft((current) => {
        const kept = withKept(current.kept, suggestionItems(result.suggestions))
        return {
          ...current,
          kept,
          languages: mergeTopicDraft(current.languages, result.suggestions.languages, kept),
          hobbies: mergeTopicDraft(current.hobbies, result.suggestions.hobbies, kept),
          locations: mergeTopicDraft(current.locations, result.suggestions.locations, kept),
          interests: mergeTopicDraft(current.interests, result.suggestions.interests, kept),
          festivals: mergeTopicDraft(current.festivals, result.suggestions.festivals, kept),
        }
      })
      setSpotifyGenres(result.genres)
      setSpotifyArtists(
        result.artists.filter((artist) => artist.name.trim().length > 0).slice(0, TOP_ARTISTS),
      )
      setSpotifySummary(spotifySummaryText(result.genres, result.artists))
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : "Spotify import failed")
    } finally {
      setSpotifyBusy(false)
    }
  }

  async function suggestFromMeta() {
    setMetaError(null)
    setMetaBusy(true)
    try {
      const result = await importMeta(getToken)
      setDraft((current) => {
        const incoming = [...result.suggestions.knows, ...result.suggestions.wants_to_learn]
        const kept = withKept(current.kept, incoming)
        return {
          ...current,
          kept,
          languages: {
            knows: mergeCommaList(current.languages.knows, result.suggestions.knows, kept),
            wants: mergeCommaList(current.languages.wants, result.suggestions.wants_to_learn, kept),
          },
        }
      })
      setMetaSummary(`Meta suggested: ${result.languages.join(", ")}`)
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Meta import failed")
    } finally {
      setMetaBusy(false)
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
    const tabs = DESK_TABS.filter((tab) => tab.id !== "pages" || extras)
    return (
      <div className="flow">
        <nav className="desk-nav" aria-label="Orbit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={desk === tab.id ? undefined : "ghost"}
              aria-current={desk === tab.id ? "page" : undefined}
              onClick={() => setDesk(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {desk === "people" ? (
          <Matches
            viewer={viewer}
            getToken={getToken}
            links={links}
            onConnected={() => setReachKey((key) => key + 1)}
          />
        ) : null}
        {profilePanel}
        {desk === "reach" ? <Reach getToken={getToken} refreshKey={reachKey} onLinks={onLinks} /> : null}
        {desk === "events" ? <NearbyEvents getToken={getToken} /> : null}
        {desk === "plans" ? <Plans getToken={getToken} /> : null}
        {desk === "pages" && extras ? <div className="tickets">{extras}</div> : null}
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
        <ol className="steps" aria-hidden="true">
          {FLOW_STEPS.map((item, index) => (
            <li
              key={item.id}
              className={index < stepIndex ? "done" : index === stepIndex ? "now" : undefined}
            >
              {item.label}
            </li>
          ))}
        </ol>
        <h2>{step.title}</h2>
        {step.id === "about" ? (
          <p className="note">Orbit does not pull your name or city from connected accounts.</p>
        ) : null}
        {step.id === "reach" ? (
          <p className="note">Usernames are optional. Add the place you actually answer.</p>
        ) : null}
        {step.id === "preferences" ? (
          <p className="note">
            Hobbies, places, interests, and festivals each have their own list. Interests from Spotify are
            already in these lists when you asked for them. Separate items with commas.
          </p>
        ) : null}

        {step.id === "spotify" ? (
          <div className="listen">
            <div className="record" aria-hidden="true" />
            <div>
              <p>
                Connect Spotify and we’ll suggest interests from what you listen to. Edit them on the last
                step, or continue without connecting.
              </p>
              <SpotifyConnect lead />
              <button
                type="button"
                className="ghost"
                disabled={spotifyBusy}
                onClick={() => void suggestFromSpotify()}
              >
                {spotifyBusy ? "Suggesting…" : "Suggest from Spotify"}
              </button>
              {spotifySummary ? <p className="note">{spotifySummary}</p> : null}
              {spotifyGenres.length > 0 && spotifySummary ? (
                <ul className="chips">
                  {spotifyGenres.map((genre) => (
                    <li key={genre}>{genre}</li>
                  ))}
                </ul>
              ) : null}
              {spotifyError ? <p className="error">{spotifyError}</p> : null}
            </div>
            {spotifyArtists.length > 0 ? (
              <div className="artist-shelf">
                <p className="note shelf-label">Your top artists</p>
                <ul className="artist-grid">
                  {spotifyArtists.map((artist) => (
                    <ArtistCard key={artist.name} artist={artist} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
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
            <CityMap
              value={draft.location}
              onChange={(location) => setDraft((current) => ({ ...current, location }))}
            />
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
                  {key === "interests" ? (
                    <div className="actions">
                      {INTEREST_STARTERS.map((interest) => (
                        <button
                          key={interest}
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              interests: {
                                ...current.interests,
                                knows: mergeCommaList(current.interests.knows, [interest], current.kept),
                              },
                            }))
                          }
                        >
                          {interest}
                        </button>
                      ))}
                    </div>
                  ) : null}
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
            <button type="button" className="ghost" disabled={metaBusy} onClick={() => void suggestFromMeta()}>
              {metaBusy ? "Suggesting…" : "Suggest languages from Meta"}
            </button>
            {metaSummary ? <p className="note">{metaSummary}</p> : null}
            {metaError ? <p className="error">{metaError}</p> : null}
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

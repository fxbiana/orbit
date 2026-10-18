import { sessionToken } from "./api"

const apiBase = () =>
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "")

export type SpotifyArtist = { name: string; genres: string[] }
export type SpotifyTrack = { name: string; artists: string[] }
export type SpotifyTopic = { knows: string[]; wants_to_learn: string[] }
export type SpotifySuggestions = {
  languages: SpotifyTopic
  locations: SpotifyTopic
  hobbies: SpotifyTopic
  interests: SpotifyTopic
  festivals: SpotifyTopic
}
export type SpotifyImport = {
  artists: SpotifyArtist[]
  tracks: SpotifyTrack[]
  genres: string[]
  suggestions: SpotifySuggestions
  model: string | null
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function emptyTopic(): SpotifyTopic {
  return { knows: [], wants_to_learn: [] }
}

function topic(value: unknown): SpotifyTopic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyTopic()
  const record = value as Record<string, unknown>
  return {
    knows: strings(record.knows),
    wants_to_learn: strings(record.wants_to_learn),
  }
}

function suggestionsOf(value: Record<string, unknown>): SpotifySuggestions {
  return {
    languages: topic(value.languages),
    locations: topic(value.locations),
    hobbies: topic(value.hobbies),
    interests: topic(value.interests),
    festivals: topic(value.festivals),
  }
}

function artistsOf(value: unknown): SpotifyArtist[] {
  if (!Array.isArray(value)) return []
  const artists: SpotifyArtist[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    artists.push({
      name: typeof record.name === "string" ? record.name : "",
      genres: strings(record.genres),
    })
  }
  return artists
}

function tracksOf(value: unknown): SpotifyTrack[] {
  if (!Array.isArray(value)) return []
  const tracks: SpotifyTrack[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    tracks.push({
      name: typeof record.name === "string" ? record.name : "",
      artists: strings(record.artists),
    })
  }
  return tracks
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body && typeof body.error === "string") return body.error
  } catch {
    /* The body was not JSON. */
  }
  return `${response.status}`
}

export async function importSpotify(getToken: () => Promise<string | null>): Promise<SpotifyImport> {
  const token = await sessionToken(getToken)
  const response = await fetch(`${apiBase()}/api/spotify/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
  if (!response.ok) throw new Error(await errorMessage(response))

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error("Spotify import failed")
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Spotify import failed")
  const record = body as Record<string, unknown>
  const suggestions = record.suggestions
  if (!suggestions || typeof suggestions !== "object" || Array.isArray(suggestions)) {
    throw new Error("Spotify import failed")
  }
  return {
    artists: artistsOf(record.artists),
    tracks: tracksOf(record.tracks),
    genres: strings(record.genres),
    suggestions: suggestionsOf(suggestions as Record<string, unknown>),
    model: typeof record.model === "string" ? record.model : null,
  }
}

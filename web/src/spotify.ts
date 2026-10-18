import { sessionToken } from "./api"

const apiBase = () =>
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "")

export type SpotifyArtist = {
  name: string
  imageUrl: string | null
}

export type SpotifyImport = {
  genres: string[]
  artists: SpotifyArtist[]
  suggestions: {
    knows: string[]
    wants_to_learn: string[]
  }
}

function artists(value: unknown): SpotifyArtist[] {
  if (!Array.isArray(value)) return []
  const portraits: SpotifyArtist[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    if (typeof record.name !== "string") continue
    const name = record.name.trim()
    if (!name) continue
    const image = record.image_url
    portraits.push({
      name,
      imageUrl: typeof image === "string" && image.startsWith("https://") ? image : null,
    })
  }
  return portraits
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
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
  if (!body || typeof body !== "object") throw new Error("Spotify import failed")
  const record = body as Record<string, unknown>
  const suggestions = record.suggestions
  if (!suggestions || typeof suggestions !== "object") throw new Error("Spotify import failed")
  const suggestion = suggestions as Record<string, unknown>
  return {
    genres: strings(record.genres),
    artists: artists(record.artists),
    suggestions: {
      knows: strings(suggestion.knows),
      wants_to_learn: strings(suggestion.wants_to_learn),
    },
  }
}

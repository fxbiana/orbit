import { sessionToken } from "./api"

const apiBase = () =>
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "")

export type MetaImport = {
  languages: string[]
  suggestions: {
    knows: string[]
    wants_to_learn: string[]
  }
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

export async function importMeta(getToken: () => Promise<string | null>): Promise<MetaImport> {
  const token = await sessionToken(getToken)
  const response = await fetch(`${apiBase()}/api/meta/import`, {
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
    throw new Error("Meta import failed")
  }
  if (!body || typeof body !== "object") throw new Error("Meta import failed")
  const record = body as Record<string, unknown>
  const suggestions = record.suggestions
  if (!suggestions || typeof suggestions !== "object") throw new Error("Meta import failed")
  const suggestion = suggestions as Record<string, unknown>
  return {
    languages: strings(record.languages),
    suggestions: {
      knows: strings(suggestion.knows),
      wants_to_learn: strings(suggestion.wants_to_learn),
    },
  }
}

import type { OnboardingInput, OnboardingProfile } from "./onboarding"

const apiBase = () =>
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "")

export type Ticket = {
  id: string
  title: string
  url: string
  status: string
  created_at: string | null
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

export async function sessionToken(getToken: () => Promise<string | null>): Promise<string> {
  const token = await getToken()
  if (!token) throw new Error("No session token")
  return token
}

function authHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(extra ?? {}),
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: authHeaders(token, init?.headers),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json() as Promise<T>
}

export function listTickets(token: string) {
  return request<{ tickets: Ticket[] }>("/api/tickets", token)
}

export function createTicket(token: string, ticket: { title: string; url: string }) {
  return request<Ticket>("/api/tickets", token, {
    method: "POST",
    body: JSON.stringify(ticket),
  })
}

export async function getOnboarding(token: string): Promise<OnboardingProfile | null> {
  const response = await fetch(`${apiBase()}/api/onboarding`, {
    headers: authHeaders(token),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json() as Promise<OnboardingProfile>
}

export function saveOnboarding(token: string, profile: OnboardingInput) {
  return request<OnboardingProfile>("/api/onboarding", token, {
    method: "PUT",
    body: JSON.stringify(profile),
  })
}

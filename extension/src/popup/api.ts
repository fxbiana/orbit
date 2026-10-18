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

async function request<T>(path: string, userId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "X-User-Id": userId,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json() as Promise<T>
}

export function listTickets(userId: string) {
  return request<{ tickets: Ticket[] }>("/api/tickets", userId)
}

export function createTicket(userId: string, ticket: { title: string; url: string }) {
  return request<Ticket>("/api/tickets", userId, {
    method: "POST",
    body: JSON.stringify(ticket),
  })
}

export async function getOnboarding(userId: string): Promise<OnboardingProfile | null> {
  const response = await fetch(`${apiBase()}/api/onboarding`, {
    headers: { "X-User-Id": userId },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json() as Promise<OnboardingProfile>
}

export function saveOnboarding(userId: string, profile: OnboardingInput) {
  return request<OnboardingProfile>("/api/onboarding", userId, {
    method: "PUT",
    body: JSON.stringify(profile),
  })
}

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

export type Match = {
  user_id: string
  username: string
  first_name: string
  location: string
  age: number | null
  gathering_size: string
  compatibility_score: number
  matched_on: string[]
}

export function listMatches(token: string, limit = 10) {
  const query = new URLSearchParams({ limit: String(limit) })
  return request<{ matches: Match[] }>(`/api/matches?${query}`, token)
}

export const ACTIVITY_TYPES = ["coffee", "study", "workshop", "other"] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export type Plan = {
  id: string
  title: string
  activity_type: ActivityType | string
  location_text: string
  starts_at: string | null
  capacity: number | null
  status?: string
  host_id?: string
  member_count?: number
  /** Preferred API field; some stubs may still send `joined`. */
  viewer_joined?: boolean
  joined?: boolean
}

export type PlanInput = {
  title: string
  activity_type: ActivityType
  location_text: string
  starts_at?: string
  capacity?: number
}

export function listPlans(token: string) {
  return request<{ plans: Plan[] }>("/api/plans", token)
}

export function createPlan(token: string, plan: PlanInput) {
  const body: Record<string, string | number> = {
    title: plan.title,
    activity_type: plan.activity_type,
    location_text: plan.location_text,
  }
  if (plan.starts_at) body.starts_at = plan.starts_at
  if (plan.capacity != null) body.capacity = plan.capacity
  return request<Plan>("/api/plans", token, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function joinPlan(token: string, planId: string) {
  return request<Plan>(`/api/plans/${encodeURIComponent(planId)}/join`, token, {
    method: "POST",
    body: "{}",
  })
}

export const CONTACT_CHANNELS = ["instagram", "discord", "snapchat", "facebook"] as const

export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

export type PreferredChannel = "" | ContactChannel | "orbit"

export type Contact = {
  instagram: string
  discord: string
  snapchat: string
  facebook: string
  preferred: PreferredChannel
  reach_note: string
  updated_at: string | null
}

export type PublicContact = Omit<Contact, "updated_at">

export type ConnectionPerson = {
  user_id: string
  first_name: string
  username: string
}

export type Connection = {
  id: string
  from_user_id: string
  to_user_id: string
  status: "pending" | "accepted" | "rejected" | string
  intro: string
  other: ConnectionPerson
  contact: PublicContact | null
  created_at: string | null
  updated_at: string | null
  responded_at: string | null
}

export type ConnectionBox = "inbox" | "outbox" | "friends"

export type ChatMessage = {
  id: string
  author_id: string
  text: string
  created_at: string | null
  mine: boolean
}

export function getContact(token: string) {
  return request<Contact>("/api/contact", token)
}

export function saveContact(
  token: string,
  contact: Pick<Contact, "instagram" | "discord" | "snapchat" | "facebook" | "preferred" | "reach_note">,
) {
  return request<Contact>("/api/contact", token, {
    method: "PUT",
    body: JSON.stringify(contact),
  })
}

export function listConnections(token: string, box: ConnectionBox) {
  const query = new URLSearchParams({ box })
  return request<{ connections: Connection[] }>(`/api/connections?${query}`, token)
}

export function createConnection(token: string, input: { to_user_id: string; intro?: string }) {
  const body: Record<string, string> = { to_user_id: input.to_user_id }
  if (input.intro) body.intro = input.intro
  return request<Connection>("/api/connections", token, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function acceptConnection(token: string, connectionId: string) {
  return request<Connection>(`/api/connections/${encodeURIComponent(connectionId)}/accept`, token, {
    method: "POST",
    body: "{}",
  })
}

export function rejectConnection(token: string, connectionId: string) {
  return request<Connection>(`/api/connections/${encodeURIComponent(connectionId)}/reject`, token, {
    method: "POST",
    body: "{}",
  })
}

export function listMessages(token: string, connectionId: string) {
  return request<{ messages: ChatMessage[] }>(
    `/api/connections/${encodeURIComponent(connectionId)}/messages`,
    token,
  )
}

export function sendMessage(token: string, connectionId: string, text: string) {
  return request<ChatMessage>(`/api/connections/${encodeURIComponent(connectionId)}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ text }),
  })
}

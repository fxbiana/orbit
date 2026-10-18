const apiBase = () =>
  (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "")

export type Ticket = {
  id: string
  title: string
  url: string
  status: string
  created_at: string | null
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `${response.status}`)
  }
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

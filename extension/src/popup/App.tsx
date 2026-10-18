import { useEffect, useState } from "react"
import { readActiveTab } from "../tabs"
import { createTicket, listTickets, type Ticket } from "./api"
import { localUserId } from "./localUser"
import { OnboardingForm } from "./OnboardingForm"

export function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    localUserId()
      .then((id) => {
        if (!cancelled) setUserId(id)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="popup">
      <header className="bar">
        <h1>Ticket Trapper</h1>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {!userId && !error ? <p>Loading...</p> : null}
      {userId ? (
        <>
          <OnboardingForm userId={userId} />
          <TicketPanel userId={userId} />
        </>
      ) : null}
    </main>
  )
}

function TicketPanel({ userId }: { userId: string }) {
  const [tab, setTab] = useState<{ title: string; url: string } | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    readActiveTab()
      .then((active) => {
        if (!cancelled) setTab(active)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    listTickets(userId)
      .then((body) => {
        if (!cancelled) setTickets(body.tickets)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  async function save() {
    if (!tab) return
    setSaving(true)
    setError(null)
    try {
      await createTicket(userId, tab)
      const body = await listTickets(userId)
      setTickets(body.tickets)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section>
        <h2>This page</h2>
        <p className="title">{tab?.title ?? "Reading the active tab..."}</p>
        {tab?.url ? <p className="url">{tab.url}</p> : null}
        <button type="button" onClick={save} disabled={!tab || saving}>
          {saving ? "Saving..." : "Save ticket"}
        </button>
      </section>
      {error ? <p className="error">{error}</p> : null}
      <section>
        <h2>Saved</h2>
        {tickets.length === 0 ? <p>No tickets yet.</p> : null}
        <ul>
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <a href={ticket.url} target="_blank" rel="noreferrer">
                {ticket.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

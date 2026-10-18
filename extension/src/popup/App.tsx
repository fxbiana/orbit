import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/chrome-extension"
import { useEffect, useState } from "react"
import { readActiveTab } from "../tabs"
import { createTicket, listTickets, type Ticket } from "./api"

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const POPUP_URL = chrome.runtime.getURL("src/popup/index.html")

export function App() {
  if (!PUBLISHABLE_KEY) {
    return (
      <main className="popup">
        <h1>Ticket Trapper</h1>
        <p>Set VITE_CLERK_PUBLISHABLE_KEY in extension/.env, then restart the extension dev server.</p>
      </main>
    )
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl={POPUP_URL}
      signInFallbackRedirectUrl={POPUP_URL}
      signUpFallbackRedirectUrl={POPUP_URL}
    >
      <main className="popup">
        <header className="bar">
          <h1>Ticket Trapper</h1>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </header>
        <Show when="signed-out">
          <p>Sign in to save the page you are on.</p>
          <SignInButton />
        </Show>
        <Show when="signed-in">
          <TicketPanel />
        </Show>
      </main>
    </ClerkProvider>
  )
}

function TicketPanel() {
  const { getToken } = useAuth()
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

    getToken()
      .then((token) => {
        if (!token) throw new Error("No session token")
        return listTickets(token)
      })
      .then((body) => {
        if (!cancelled) setTickets(body.tickets)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [getToken])

  async function save() {
    if (!tab) return
    setSaving(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error("No session token")
      await createTicket(token, tab)
      const body = await listTickets(token)
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

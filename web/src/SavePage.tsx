import { FormEvent, useEffect, useState } from "react"
import { createTicket, listTickets, sessionToken, type Ticket } from "./api"
import { PANEL_KEYS, loadCached, readCache, refreshCached } from "./panelCache"

export function SavePage({ getToken }: { getToken: () => Promise<string | null> }) {
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const cached = readCache<{ tickets: Ticket[] }>(PANEL_KEYS.tickets)
  const [tickets, setTickets] = useState<Ticket[]>(cached?.tickets ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    sessionToken(getToken)
      .then((token) => loadCached(PANEL_KEYS.tickets, () => listTickets(token)))
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

  async function save(event: FormEvent) {
    event.preventDefault()
    const next = { title: title.trim(), url: url.trim() }
    if (!next.title || !next.url) {
      setError("Add a title and a URL.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const token = await sessionToken(getToken)
      await createTicket(token, next)
      const body = await refreshCached(PANEL_KEYS.tickets, () => listTickets(token))
      setTickets(body.tickets)
      setTitle("")
      setUrl("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="save-page">
      <h2>Save a page</h2>
      <form className="save-form" onSubmit={save}>
        <label htmlFor="page-title">
          Title
          <input
            id="page-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label htmlFor="page-url">
          URL
          <input
            id="page-url"
            type="url"
            value={url}
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save page"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {tickets.length === 0 ? <p className="note">No pages saved yet.</p> : null}
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
  )
}

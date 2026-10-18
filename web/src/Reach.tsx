import { FormEvent, useEffect, useState } from "react"
import {
  acceptConnection,
  getContact,
  listConnections,
  listMessages,
  rejectConnection,
  saveContact,
  sendMessage,
  sessionToken,
  type ChatMessage,
  type Connection,
  type Contact,
  type PreferredChannel,
  type PublicContact,
} from "./api"

export type LinkStatus = "out" | "in" | "accepted"

type ContactDraft = {
  instagram: string
  discord: string
  snapchat: string
  preferred: PreferredChannel
  reach_note: string
}

const EMPTY_DRAFT: ContactDraft = {
  instagram: "",
  discord: "",
  snapchat: "",
  preferred: "",
  reach_note: "",
}

const HANDLE = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  discord: /^[A-Za-z0-9._]{2,32}$/,
  snapchat: /^[A-Za-z][A-Za-z0-9._-]{2,14}$/,
}

function asPreferred(value: string): PreferredChannel {
  if (value === "instagram" || value === "discord" || value === "snapchat" || value === "orbit") {
    return value
  }
  return ""
}

function draftFrom(contact: Contact): ContactDraft {
  return {
    instagram: contact.instagram,
    discord: contact.discord,
    snapchat: contact.snapchat,
    preferred: asPreferred(contact.preferred),
    reach_note: contact.reach_note,
  }
}

function username(value: string): string {
  return value.trim().replace(/^@+/, "")
}

function draftProblem(draft: ContactDraft): string | null {
  if (draft.preferred === "instagram" && !username(draft.instagram)) {
    return "Add an Instagram username to prefer it."
  }
  if (draft.preferred === "discord" && !username(draft.discord)) {
    return "Add a Discord username to prefer it."
  }
  if (draft.preferred === "snapchat" && !username(draft.snapchat)) {
    return "Add a Snapchat username to prefer it."
  }
  if (draft.reach_note.trim().length > 160) return "Keep the note to 160 characters."
  return null
}

function personName(connection: Connection): string {
  return connection.other.first_name || connection.other.username || "Them"
}

function preferLine(name: string, contact: PublicContact): string {
  if (contact.preferred === "orbit") return `${name} prefers messages here.`
  if (contact.preferred === "instagram") return `${name} prefers Instagram.`
  if (contact.preferred === "discord") return `${name} prefers Discord.`
  if (contact.preferred === "snapchat") return `${name} prefers Snapchat.`
  if (contact.instagram || contact.discord || contact.snapchat) return `${name} left a way to reach them.`
  return `${name} hasn't added a social link yet. Message them here.`
}

function SocialLinks({ contact }: { contact: PublicContact }) {
  const [copied, setCopied] = useState(false)
  const instagram = HANDLE.instagram.test(contact.instagram) ? contact.instagram : ""
  const discord = HANDLE.discord.test(contact.discord) ? contact.discord : ""
  const snapchat = HANDLE.snapchat.test(contact.snapchat) ? contact.snapchat : ""

  async function copyDiscord() {
    try {
      await navigator.clipboard.writeText(discord)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (!instagram && !discord && !snapchat) return null

  return (
    <p className="socials">
      {instagram ? (
        <a href={`https://instagram.com/${encodeURIComponent(instagram)}`} target="_blank" rel="noreferrer">
          Instagram · {instagram}
        </a>
      ) : null}
      {discord ? (
        <button type="button" className="linkish" onClick={copyDiscord}>
          {copied ? "Discord copied" : `Copy Discord · ${discord}`}
        </button>
      ) : null}
      {snapchat ? (
        <a href={`https://www.snapchat.com/add/${encodeURIComponent(snapchat)}`} target="_blank" rel="noreferrer">
          Snapchat · {snapchat}
        </a>
      ) : null}
    </p>
  )
}

function Thread({
  connectionId,
  name,
  getToken,
}: {
  connectionId: string
  name: string
  getToken: () => Promise<string | null>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    sessionToken(getToken)
      .then((token) => listMessages(token, connectionId))
      .then((body) => {
        if (cancelled) return
        setMessages(body.messages ?? [])
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoaded(true)
        setError(err instanceof Error ? err.message : "Could not load messages.")
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, getToken])

  async function onSend(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setSending(true)
    setError(null)
    try {
      const sent = await sendMessage(await sessionToken(getToken), connectionId, trimmed)
      setMessages((current) => [...current, sent])
      setText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that message.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="thread">
      {loaded && messages.length === 0 ? <p className="meta">Say when and where.</p> : null}
      <ul>
        {messages.map((message) => (
          <li key={message.id} className={message.mine ? "bubble mine" : "bubble"}>
            <span className="sr">{message.mine ? "You" : name}: </span>
            {message.text}
          </li>
        ))}
      </ul>
      <form className="composer" onSubmit={onSend}>
        <label className="sr" htmlFor={`message-${connectionId}`}>
          Message
        </label>
        <input
          id={`message-${connectionId}`}
          value={text}
          maxLength={500}
          placeholder="Thursday after 6 at the library"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={sending || text.trim() === ""}>
          Send
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

function FriendCard({
  connection,
  getToken,
}: {
  connection: Connection
  getToken: () => Promise<string | null>
}) {
  const name = personName(connection)
  const contact = connection.contact ?? {
    instagram: "",
    discord: "",
    snapchat: "",
    preferred: "",
    reach_note: "",
  }

  return (
    <article className="friend">
      <h3>{name}</h3>
      <p className="prefer">{preferLine(name, contact)}</p>
      {contact.reach_note ? <p className="meta">{contact.reach_note}</p> : null}
      <SocialLinks contact={contact} />
      <Thread connectionId={connection.id} name={name} getToken={getToken} />
    </article>
  )
}

export function Reach({
  getToken,
  refreshKey = 0,
  onLinks,
}: {
  getToken: () => Promise<string | null>
  refreshKey?: number
  onLinks?: (links: Record<string, LinkStatus>) => void
}) {
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT)
  const [inbox, setInbox] = useState<Connection[]>([])
  const [outbox, setOutbox] = useState<Connection[]>([])
  const [friends, setFriends] = useState<Connection[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    const token = await sessionToken(getToken)
    const [contact, incoming, outgoing, accepted] = await Promise.all([
      getContact(token),
      listConnections(token, "inbox"),
      listConnections(token, "outbox"),
      listConnections(token, "friends"),
    ])
    setDraft(draftFrom(contact))
    setInbox(incoming.connections ?? [])
    setOutbox(outgoing.connections ?? [])
    setFriends(accepted.connections ?? [])
    setAvailable(true)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    reload()
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [getToken, refreshKey])

  useEffect(() => {
    if (!onLinks) return
    const links: Record<string, LinkStatus> = {}
    for (const item of outbox) links[item.other.user_id] = "out"
    for (const item of inbox) links[item.other.user_id] = "in"
    for (const item of friends) links[item.other.user_id] = "accepted"
    onLinks(links)
  }, [inbox, outbox, friends, onLinks])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    const problem = draftProblem(draft)
    if (problem) {
      setSaveError(problem)
      setSaved(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const stored = await saveContact(await sessionToken(getToken), draft)
      setDraft(draftFrom(stored))
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save how to reach you.")
    } finally {
      setSaving(false)
    }
  }

  async function respond(connectionId: string, action: "accept" | "reject") {
    setBusyId(connectionId)
    setActionError(null)
    try {
      const token = await sessionToken(getToken)
      if (action === "accept") await acceptConnection(token, connectionId)
      else await rejectConnection(token, connectionId)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update that request.")
    } finally {
      setBusyId(null)
    }
  }

  const openRequests = inbox.length + outbox.length

  return (
    <section className="reach" id="reach">
      <h2>Reach</h2>
      <p className="note">
        A match can see your name and score. Instagram, Discord, Snapchat, and messages open after
        you both accept.
      </p>
      {loading ? <p className="note">Loading reach…</p> : null}
      {!available ? <p className="note">Reach needs the API. Your links stay off the match list.</p> : null}
      {available ? (
        <form className="reach-form" onSubmit={onSave}>
          <h3>How you want to be reached</h3>
          <label htmlFor="instagram">
            Instagram
            <input
              id="instagram"
              value={draft.instagram}
              autoComplete="off"
              placeholder="amira.learns"
              onChange={(event) => setDraft((current) => ({ ...current, instagram: event.target.value }))}
            />
          </label>
          <label htmlFor="discord">
            Discord
            <input
              id="discord"
              value={draft.discord}
              autoComplete="off"
              placeholder="amira"
              onChange={(event) => setDraft((current) => ({ ...current, discord: event.target.value }))}
            />
          </label>
          <label htmlFor="snapchat">
            Snapchat
            <input
              id="snapchat"
              value={draft.snapchat}
              autoComplete="off"
              placeholder="amira"
              onChange={(event) => setDraft((current) => ({ ...current, snapchat: event.target.value }))}
            />
          </label>
          <p className="meta">Usernames only. A link is not saved.</p>
          <fieldset className="choices">
            <legend>Where you actually answer</legend>
            <label className="choice">
              <input
                type="radio"
                name="preferred"
                value=""
                checked={draft.preferred === ""}
                onChange={() => setDraft((current) => ({ ...current, preferred: "" }))}
              />
              No preference
            </label>
            <label className="choice">
              <input
                type="radio"
                name="preferred"
                value="orbit"
                checked={draft.preferred === "orbit"}
                onChange={() => setDraft((current) => ({ ...current, preferred: "orbit" }))}
              />
              Messages on Orbit
            </label>
            <label className="choice">
              <input
                type="radio"
                name="preferred"
                value="instagram"
                checked={draft.preferred === "instagram"}
                onChange={() => setDraft((current) => ({ ...current, preferred: "instagram" }))}
              />
              Instagram
            </label>
            <label className="choice">
              <input
                type="radio"
                name="preferred"
                value="discord"
                checked={draft.preferred === "discord"}
                onChange={() => setDraft((current) => ({ ...current, preferred: "discord" }))}
              />
              Discord
            </label>
            <label className="choice">
              <input
                type="radio"
                name="preferred"
                value="snapchat"
                checked={draft.preferred === "snapchat"}
                onChange={() => setDraft((current) => ({ ...current, preferred: "snapchat" }))}
              />
              Snapchat
            </label>
          </fieldset>
          <label htmlFor="reach-note">
            When you usually reply
            <textarea
              id="reach-note"
              rows={2}
              maxLength={160}
              value={draft.reach_note}
              placeholder="I check Discord in the evening."
              onChange={(event) => setDraft((current) => ({ ...current, reach_note: event.target.value }))}
            />
          </label>
          {saveError ? <p className="error">{saveError}</p> : null}
          {saved ? <p className="note">Saved. People see this after you both accept.</p> : null}
          <div className="actions">
            <span />
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save reach info"}
            </button>
          </div>
        </form>
      ) : null}

      {available && !loading ? (
        <>
          <h3>Requests</h3>
          {actionError ? <p className="error">{actionError}</p> : null}
          {openRequests === 0 ? <p className="note">No open requests. Ask someone from the list above.</p> : null}
          <ul className="request-list">
            {inbox.map((connection) => (
              <li key={connection.id} className="request">
                <h3>{personName(connection)} asked to connect</h3>
                {connection.intro ? <p className="reason">{connection.intro}</p> : null}
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busyId === connection.id}
                    onClick={() => respond(connection.id, "reject")}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busyId === connection.id}
                    onClick={() => respond(connection.id, "accept")}
                  >
                    Accept
                  </button>
                </div>
              </li>
            ))}
            {outbox.map((connection) => (
              <li key={connection.id} className="request">
                <h3>Waiting on {personName(connection)}</h3>
                {connection.intro ? <p className="reason">{connection.intro}</p> : null}
              </li>
            ))}
          </ul>

          <h3>Connected</h3>
          {friends.length === 0 ? (
            <p className="note">
              When someone accepts, their Instagram, Discord, or Snapchat shows up here, and you can
              message on Orbit.
            </p>
          ) : (
            friends.map((connection) => (
              <FriendCard key={connection.id} connection={connection} getToken={getToken} />
            ))
          )}
        </>
      ) : null}
    </section>
  )
}

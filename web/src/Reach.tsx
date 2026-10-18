import { FormEvent, ReactNode, useEffect, useState } from "react"
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
import { PANEL_KEYS, loadCached, readCache, refreshCached, writeCache } from "./panelCache"

export type LinkStatus = "out" | "in" | "accepted"

export type ContactDraft = {
  instagram: string
  discord: string
  snapchat: string
  facebook: string
  preferred: PreferredChannel
  reach_note: string
}

const EMPTY_DRAFT: ContactDraft = {
  instagram: "",
  discord: "",
  snapchat: "",
  facebook: "",
  preferred: "",
  reach_note: "",
}

const HANDLE = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  discord: /^[A-Za-z0-9._]{2,32}$/,
  snapchat: /^[A-Za-z][A-Za-z0-9._-]{2,14}$/,
  facebook: /^[A-Za-z0-9.]{5,50}$/,
}

function asPreferred(value: string): PreferredChannel {
  if (
    value === "instagram" ||
    value === "discord" ||
    value === "snapchat" ||
    value === "facebook" ||
    value === "orbit"
  ) {
    return value
  }
  return ""
}

function draftFrom(contact: Contact): ContactDraft {
  return {
    instagram: contact.instagram,
    discord: contact.discord,
    snapchat: contact.snapchat,
    facebook: contact.facebook,
    preferred: asPreferred(contact.preferred),
    reach_note: contact.reach_note,
  }
}

function username(value: string): string {
  return value.trim().replace(/^@+/, "")
}

function handleProblem(label: string, value: string, pattern: RegExp): string | null {
  const text = username(value)
  if (!text) return null
  if (text.includes("/") || text.includes(":") || /\s/.test(text)) {
    return `${label} must be a username, not a link.`
  }
  if (!pattern.test(text)) return `${label} username is not valid.`
  return null
}

export function contactProblem(draft: ContactDraft): string | null {
  const instagram = handleProblem("Instagram", draft.instagram, HANDLE.instagram)
  if (instagram) return instagram
  const discord = handleProblem("Discord", draft.discord, HANDLE.discord)
  if (discord) return discord
  const snapchat = handleProblem("Snapchat", draft.snapchat, HANDLE.snapchat)
  if (snapchat) return snapchat
  const facebook = handleProblem("Facebook", draft.facebook, HANDLE.facebook)
  if (facebook) return facebook
  if (draft.preferred === "instagram" && !username(draft.instagram)) {
    return "Add an Instagram username to prefer it."
  }
  if (draft.preferred === "discord" && !username(draft.discord)) {
    return "Add a Discord username to prefer it."
  }
  if (draft.preferred === "snapchat" && !username(draft.snapchat)) {
    return "Add a Snapchat username to prefer it."
  }
  if (draft.preferred === "facebook" && !username(draft.facebook)) {
    return "Add a Facebook username to prefer it."
  }
  if (draft.reach_note.trim().length > 160) return "Keep the note to 160 characters."
  return null
}

export function contactToSave(draft: ContactDraft) {
  return {
    instagram: username(draft.instagram),
    discord: username(draft.discord),
    snapchat: username(draft.snapchat),
    facebook: username(draft.facebook),
    preferred: draft.preferred,
    reach_note: draft.reach_note.trim(),
  }
}

export function ReachFields({
  draft,
  onChange,
  dense = false,
}: {
  draft: ContactDraft
  onChange: (next: ContactDraft) => void
  dense?: boolean
}) {
  if (dense) {
    const handles = [
      ["instagram", "Instagram", "amira.learns"],
      ["discord", "Discord", "amira"],
      ["snapchat", "Snapchat", "amira"],
      ["facebook", "Facebook", "amira.learns"],
    ] as const
    return (
      <div className="reach-dense">
        {handles.map(([key, label, placeholder]) => (
          <label key={key} htmlFor={key}>
            {label}
            <input
              id={key}
              value={draft[key]}
              autoComplete="off"
              placeholder={placeholder}
              onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
        <label htmlFor="preferred-channel">
          Where you answer
          <select
            id="preferred-channel"
            value={draft.preferred}
            onChange={(event) =>
              onChange({ ...draft, preferred: event.target.value as ContactDraft["preferred"] })
            }
          >
            <option value="">No preference</option>
            <option value="orbit">Messages on Orbit</option>
            <option value="instagram">Instagram</option>
            <option value="discord">Discord</option>
            <option value="snapchat">Snapchat</option>
            <option value="facebook">Facebook</option>
          </select>
        </label>
      </div>
    )
  }

  return (
    <>
      <label htmlFor="instagram">
        Instagram
        <input
          id="instagram"
          value={draft.instagram}
          autoComplete="off"
          placeholder="amira.learns"
          onChange={(event) => onChange({ ...draft, instagram: event.target.value })}
        />
      </label>
      <label htmlFor="discord">
        Discord
        <input
          id="discord"
          value={draft.discord}
          autoComplete="off"
          placeholder="amira"
          onChange={(event) => onChange({ ...draft, discord: event.target.value })}
        />
      </label>
      <label htmlFor="snapchat">
        Snapchat
        <input
          id="snapchat"
          value={draft.snapchat}
          autoComplete="off"
          placeholder="amira"
          onChange={(event) => onChange({ ...draft, snapchat: event.target.value })}
        />
      </label>
      <label htmlFor="facebook">
        Facebook
        <input
          id="facebook"
          value={draft.facebook}
          autoComplete="off"
          placeholder="amira.learns"
          onChange={(event) => onChange({ ...draft, facebook: event.target.value })}
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
            onChange={() => onChange({ ...draft, preferred: "" })}
          />
          No preference
        </label>
        <label className="choice">
          <input
            type="radio"
            name="preferred"
            value="orbit"
            checked={draft.preferred === "orbit"}
            onChange={() => onChange({ ...draft, preferred: "orbit" })}
          />
          Messages on Orbit
        </label>
        <label className="choice">
          <input
            type="radio"
            name="preferred"
            value="instagram"
            checked={draft.preferred === "instagram"}
            onChange={() => onChange({ ...draft, preferred: "instagram" })}
          />
          Instagram
        </label>
        <label className="choice">
          <input
            type="radio"
            name="preferred"
            value="discord"
            checked={draft.preferred === "discord"}
            onChange={() => onChange({ ...draft, preferred: "discord" })}
          />
          Discord
        </label>
        <label className="choice">
          <input
            type="radio"
            name="preferred"
            value="snapchat"
            checked={draft.preferred === "snapchat"}
            onChange={() => onChange({ ...draft, preferred: "snapchat" })}
          />
          Snapchat
        </label>
        <label className="choice">
          <input
            type="radio"
            name="preferred"
            value="facebook"
            checked={draft.preferred === "facebook"}
            onChange={() => onChange({ ...draft, preferred: "facebook" })}
          />
          Facebook
        </label>
      </fieldset>
    </>
  )
}

function personName(connection: Connection): string {
  return connection.other.first_name || connection.other.username || "Them"
}

function preferLine(name: string, contact: PublicContact): string {
  if (contact.preferred === "orbit") return `${name} prefers messages here.`
  if (contact.preferred === "instagram") return `${name} prefers Instagram.`
  if (contact.preferred === "discord") return `${name} prefers Discord.`
  if (contact.preferred === "snapchat") return `${name} prefers Snapchat.`
  if (contact.preferred === "facebook") return `${name} prefers Facebook.`
  if (contact.instagram || contact.discord || contact.snapchat || contact.facebook) {
    return `${name} left a way to reach them.`
  }
  return `${name} hasn't added a social link yet. Message them here.`
}

function SocialLinks({ contact }: { contact: PublicContact }) {
  const [copied, setCopied] = useState(false)
  const instagram = HANDLE.instagram.test(contact.instagram) ? contact.instagram : ""
  const discord = HANDLE.discord.test(contact.discord) ? contact.discord : ""
  const snapchat = HANDLE.snapchat.test(contact.snapchat) ? contact.snapchat : ""
  const facebook = HANDLE.facebook.test(contact.facebook) ? contact.facebook : ""

  async function copyDiscord() {
    try {
      await navigator.clipboard.writeText(discord)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (!instagram && !discord && !snapchat && !facebook) return null

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
      {facebook ? <span>Facebook · {facebook}</span> : null}
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
  const cachedMessages = readCache<{ messages?: ChatMessage[] }>(PANEL_KEYS.messages(connectionId))
  const [messages, setMessages] = useState<ChatMessage[]>(cachedMessages?.messages ?? [])
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(cachedMessages != null)

  useEffect(() => {
    let cancelled = false
    sessionToken(getToken)
      .then((token) => loadCached(PANEL_KEYS.messages(connectionId), () => listMessages(token, connectionId)))
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
      setMessages((current) => {
        const next = [...current, sent]
        writeCache(PANEL_KEYS.messages(connectionId), { messages: next })
        return next
      })
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
    facebook: "",
    preferred: "",
    reach_note: "",
  }

  return (
    <article className="friend">
      <h3>{name}</h3>
      <p className="prefer">{preferLine(name, contact)}</p>
      <SocialLinks contact={contact} />
      <Thread connectionId={connection.id} name={name} getToken={getToken} />
    </article>
  )
}

export function ContactForm({
  getToken,
  sideAction,
}: {
  getToken: () => Promise<string | null>
  sideAction?: ReactNode
}) {
  const cachedContact = readCache<Contact>(PANEL_KEYS.contact)
  const [draft, setDraft] = useState<ContactDraft>(cachedContact ? draftFrom(cachedContact) : EMPTY_DRAFT)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    sessionToken(getToken)
      .then((token) => loadCached(PANEL_KEYS.contact, () => getContact(token)))
      .then((contact) => {
        if (!cancelled) setDraft(draftFrom(contact))
      })
      .catch(() => {
        if (!cancelled) setSaveError("Could not load how to reach you.")
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    const problem = contactProblem(draft)
    if (problem) {
      setSaveError(problem)
      setSaved(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const stored = await saveContact(await sessionToken(getToken), contactToSave(draft))
      writeCache(PANEL_KEYS.contact, stored)
      setDraft(draftFrom(stored))
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save how to reach you.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="reach-form reach-form-dense" onSubmit={onSave}>
      <ReachFields dense draft={draft} onChange={setDraft} />
      {saveError ? <p className="error">{saveError}</p> : null}
      {saved ? <p className="note">Saved. People see this after you both accept.</p> : null}
      <div className="actions">
        {sideAction ?? <span />}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
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
  const cachedInbox = readCache<{ connections?: Connection[] }>(PANEL_KEYS.inbox)
  const cachedOutbox = readCache<{ connections?: Connection[] }>(PANEL_KEYS.outbox)
  const cachedFriends = readCache<{ connections?: Connection[] }>(PANEL_KEYS.friends)
  const warmed = cachedInbox != null && cachedOutbox != null && cachedFriends != null
  const [inbox, setInbox] = useState<Connection[]>(cachedInbox?.connections ?? [])
  const [outbox, setOutbox] = useState<Connection[]>(cachedOutbox?.connections ?? [])
  const [friends, setFriends] = useState<Connection[]>(cachedFriends?.connections ?? [])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(!warmed)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function loadBoxes(refresh: boolean) {
    const token = await sessionToken(getToken)
    const read = refresh ? refreshCached : loadCached
    const [incoming, outgoing, accepted] = await Promise.all([
      read(PANEL_KEYS.inbox, () => listConnections(token, "inbox")),
      read(PANEL_KEYS.outbox, () => listConnections(token, "outbox")),
      read(PANEL_KEYS.friends, () => listConnections(token, "friends")),
    ])
    setInbox(incoming.connections ?? [])
    setOutbox(outgoing.connections ?? [])
    setFriends(accepted.connections ?? [])
    setAvailable(true)
  }

  useEffect(() => {
    let cancelled = false
    if (
      readCache(PANEL_KEYS.inbox) == null ||
      readCache(PANEL_KEYS.outbox) == null ||
      readCache(PANEL_KEYS.friends) == null
    ) {
      setLoading(true)
    }
    loadBoxes(false)
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

  async function respond(connectionId: string, action: "accept" | "reject") {
    setBusyId(connectionId)
    setActionError(null)
    try {
      const token = await sessionToken(getToken)
      if (action === "accept") await acceptConnection(token, connectionId)
      else await rejectConnection(token, connectionId)
      await loadBoxes(true)
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

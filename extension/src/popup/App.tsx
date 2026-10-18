import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/chrome-extension"
import { useEffect, useState } from "react"
import { cacheInboxInvites } from "../inviteSession"
import { readActiveTab } from "../tabs"
import { createTicket, sessionToken, webAppUrl } from "./api"

function BrandMark() {
  return (
    <h1 className="brand">
      <img src="/orbit-logo.png" alt="" />
      <span className="sr">Orbit</span>
    </h1>
  )
}

export function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    return <DegradedPopup />
  }

  const popupUrl = chrome.runtime.getURL("src/popup/index.html")

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl={popupUrl}
      signInFallbackRedirectUrl={popupUrl}
      signUpFallbackRedirectUrl={popupUrl}
    >
      <main className="popup">
        <header className="bar">
          <BrandMark />
          <Show when="signed-in">
            <div className="account">
              <UserButton />
            </div>
          </Show>
        </header>
        <Show when="signed-out">
          <p>Sign in to save this tab to Orbit.</p>
          <div className="auth-actions">
            <SignInButton mode="modal" />
            <SignUpButton mode="modal" />
          </div>
        </Show>
        <Show when="signed-in">
          <SignedInApp />
        </Show>
      </main>
    </ClerkProvider>
  )
}

/** Shown when Clerk is not configured. UI still works; save is copy-URL only. */
function DegradedPopup() {
  const [tab, setTab] = useState<{ title: string; url: string } | null>(null)
  const [sample, setSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const site = webAppUrl()

  useEffect(() => {
    let cancelled = false
    readTabForSave()
      .then((active) => {
        if (cancelled) return
        setTab({ title: active.title, url: active.url })
        setSample(active.sample)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function copyUrl() {
    if (!tab?.url) return
    setError(null)
    try {
      await navigator.clipboard.writeText(tab.url)
      setCopied(true)
    } catch {
      setError("Could not copy URL")
    }
  }

  return (
    <main className="popup">
      <header className="bar">
        <BrandMark />
      </header>
      <p className="note">
        Set VITE_CLERK_PUBLISHABLE_KEY in extension/.env to save with your account. Until then, copy
        this tab URL and paste it on the Orbit site.
      </p>
      <section>
        <h2>This tab</h2>
        {sample ? (
          <p className="note">Chrome could not read this tab, so this is a sample event page.</p>
        ) : null}
        <p className="title">{tab?.title ?? "Reading the active tab..."}</p>
        {tab?.url ? <p className="url">{tab.url}</p> : null}
        <div className="actions">
          <button type="button" onClick={copyUrl} disabled={!tab}>
            {copied ? "Copied" : "Copy URL"}
          </button>
          <a className="secondary-cta" href={site} target="_blank" rel="noreferrer">
            Open Orbit
          </a>
        </div>
      </section>
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}

function SignedInApp() {
  const { getToken } = useAuth()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getToken()
      .then(async (value) => {
        if (cancelled) return
        if (!value) {
          setError("No session token")
          return
        }
        setReady(true)
        try {
          const fresh = await sessionToken(getToken)
          if (!cancelled) await cacheInboxInvites(fresh)
        } catch {
          // A failed refresh leaves no new summaries, so the banner stays hidden.
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      {!ready && !error ? <p>Loading...</p> : null}
      {ready ? <TicketPanel getToken={getToken} /> : null}
    </>
  )
}

export function TicketPanel({ getToken }: { getToken: () => Promise<string | null> }) {
  const [tab, setTab] = useState<{ title: string; url: string } | null>(null)
  const [sample, setSample] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const site = webAppUrl()

  useEffect(() => {
    let cancelled = false
    readTabForSave()
      .then((active) => {
        if (cancelled) return
        setTab({ title: active.title, url: active.url })
        setSample(active.sample)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    if (!tab) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      // Fresh Clerk session token each save — never written to chrome.storage.
      const fresh = await sessionToken(getToken)
      await createTicket(fresh, tab)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section>
        <h2>This tab</h2>
        {sample ? (
          <p className="note">Chrome could not read this tab, so this is a sample event page.</p>
        ) : null}
        <p className="title">{tab?.title ?? "Reading the active tab..."}</p>
        {tab?.url ? <p className="url">{tab.url}</p> : null}
        <button type="button" onClick={save} disabled={!tab || saving}>
          {saving ? "Saving..." : "Save to Orbit"}
        </button>
      </section>
      {error ? <p className="error">{error}</p> : null}
      {saved ? (
        <section className="after-save">
          <p className="note">Saved to Orbit.</p>
          <a className="secondary-cta" href={site} target="_blank" rel="noreferrer">
            Find people on Orbit
          </a>
        </section>
      ) : null}
    </>
  )
}

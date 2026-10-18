import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react"
import { useEffect, useState } from "react"
import { DemoDesk } from "./DemoDesk"
import { OnboardingForm } from "./OnboardingForm"
import { SavePage } from "./SavePage"

export function App() {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    return (
      <main className="hall">
        <p className="eyebrow">Orbit</p>
        <h1>Add the Clerk publishable key to web/.env, then restart the site.</h1>
        <SignedOutPitch />
      </main>
    )
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#c4471a",
          colorBackground: "#fff8f3",
          colorText: "#4a2e24",
          colorInputBackground: "#fffdfb",
          colorInputText: "#4a2e24",
          borderRadius: "10px",
          fontFamily: "Nunito, sans-serif",
        },
      }}
    >
      <Site />
    </ClerkProvider>
  )
}

function ProfileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.4" fill="currentColor" />
      <path
        d="M3.2 13.2c.7-2.2 2.4-3.3 4.8-3.3s4.1 1.1 4.8 3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Site() {
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <div className="hall">
      <header className="top">
        <p className="wordmark">Orbit</p>
        <div className="account">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button type="button" className="ghost">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="primary">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Contact ways"
                  labelIcon={<ProfileIcon />}
                  onClick={() => setProfileOpen(true)}
                />
                <UserButton.Action label="manageAccount" />
                <UserButton.Action label="signOut" />
              </UserButton.MenuItems>
            </UserButton>
          </Show>
        </div>
      </header>
      <Show when="signed-out">
        <SignedOutPitch />
      </Show>
      <Show when="signed-in">
        <SignedIn profileOpen={profileOpen} onProfileClose={() => setProfileOpen(false)} />
      </Show>
    </div>
  )
}

function SignedOutPitch() {
  return (
    <>
      <Hero />
      <DemoDesk />
    </>
  )
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>Where Worlds Connect</h1>
        <p>
          Tell us what you want to learn. We’ll introduce you to someone who already knows it, so
          you can make a plan and go together.
        </p>
      </div>
      <div className="stub" aria-hidden="true">
        <div>
          <p>You want to learn</p>
          <strong>Dance</strong>
        </div>
        <div>
          <p>They already know</p>
          <strong>Amira · 100</strong>
        </div>
      </div>
    </section>
  )
}

function SignedIn({
  profileOpen,
  onProfileClose,
}: {
  profileOpen: boolean
  onProfileClose: () => void
}) {
  const { getToken } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getToken()
      .then((value) => {
        if (cancelled) return
        if (!value) setError("No session token")
        else setToken(value)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [getToken])

  return (
    <section className="desk">
      {error ? <p className="error">{error}</p> : null}
      {!token && !error ? <p className="note">Loading your session...</p> : null}
      {token ? (
        <OnboardingForm
          getToken={getToken}
          extras={<SavePage getToken={getToken} />}
          profileOpen={profileOpen}
          onProfileClose={onProfileClose}
        />
      ) : null}
    </section>
  )
}

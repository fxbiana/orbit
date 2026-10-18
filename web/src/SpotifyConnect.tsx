import { useUser } from "@clerk/react"
import { useState } from "react"

type ExternalAccount = {
  provider?: string
  verification?: { externalVerificationRedirectURL?: URL | string | null }
}

type SpotifyUser = {
  externalAccounts?: ExternalAccount[]
  createExternalAccount: (params: {
    strategy: "oauth_spotify"
    redirectUrl: string
    additionalScopes: string[]
  }) => Promise<ExternalAccount>
}

function isSpotify(account: ExternalAccount): boolean {
  const provider = (account.provider || "").toLowerCase()
  return provider === "oauth_spotify" || provider === "spotify"
}

export function SpotifyConnect({ lead = false }: { lead?: boolean }) {
  const { isLoaded, user } = useUser()
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const spotifyUser = user as SpotifyUser | null | undefined
  const connected = Boolean(spotifyUser?.externalAccounts?.some(isSpotify))

  async function connect() {
    if (!spotifyUser) return
    setPending(true)
    setMessage(null)
    try {
      const account = await spotifyUser.createExternalAccount({
        strategy: "oauth_spotify",
        redirectUrl: window.location.href,
        additionalScopes: ["user-top-read"],
      })
      const redirect = account.verification?.externalVerificationRedirectURL
      if (redirect) {
        window.location.assign(String(redirect))
        return
      }
      setMessage("Turn on Spotify in the Clerk dashboard, then connect again.")
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Turn on Spotify in the Clerk dashboard, then connect again.",
      )
    } finally {
      setPending(false)
    }
  }

  if (!isLoaded) return null
  if (connected) {
    return <p className="note">Spotify is connected. Suggest interests when you are ready.</p>
  }

  return (
    <div>
      <button
        type="button"
        className={lead ? "primary" : "ghost"}
        disabled={!spotifyUser || pending}
        onClick={() => void connect()}
      >
        {pending ? "Connecting…" : "Connect Spotify"}
      </button>
      {message ? <p className="meta">{message}</p> : null}
    </div>
  )
}

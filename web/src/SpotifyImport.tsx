import { useState } from "react"
import { importSpotify, sessionToken, type SpotifySnapshot } from "./api"

export function SpotifyImport({ getToken }: { getToken: () => Promise<string | null> }) {
  const [snapshot, setSnapshot] = useState<SpotifySnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runImport() {
    setBusy(true)
    setError(null)
    try {
      const body = await importSpotify(await sessionToken(getToken))
      setSnapshot(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spotify import failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="spotify-import">
      <h2>Spotify taste</h2>
      <p className="note">
        Pull genres from your linked Spotify account. Saved under your user in Firestore. Confirm
        chips in onboarding before they change your match profile.
      </p>
      <div className="actions">
        <button type="button" onClick={runImport} disabled={busy}>
          {busy ? "Importing…" : "Import from Spotify"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {snapshot ? (
        <div className="spotify-result">
          <p className="note">
            Saved {snapshot.genres.length} genres from {snapshot.artist_count} artists
            {snapshot.imported_at ? ` · ${snapshot.imported_at}` : ""}.
          </p>
          {snapshot.suggested_interests.knows.length > 0 ? (
            <ul className="chip-list">
              {snapshot.suggested_interests.knows.map((genre) => (
                <li key={genre}>{genre}</li>
              ))}
            </ul>
          ) : (
            <p className="note">No genres returned for this account.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}

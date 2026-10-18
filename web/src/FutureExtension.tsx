import { useState } from "react"

export const EXTENSION_DEMO_TABS = [
  {
    title: "Dance show",
    url: "https://www.ticketmaster.com/dance-show-seattle",
  },
  {
    title: "Live music gathering",
    url: "https://www.ticketmaster.com/live-music-seattle",
  },
] as const

export function FutureExtension() {
  const [index, setIndex] = useState(0)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const tab = EXTENSION_DEMO_TABS[index]
  const saved = savedUrl === tab.url

  return (
    <section className="later" aria-labelledby="later-title">
      <div>
        <p className="eyebrow">Extension</p>
        <h2 id="later-title">Save the page you already have open.</h2>
        <ol>
          <li>Uses the same account as Orbit on the web.</li>
          <li>Reads the title and URL of the tab you have open.</li>
          <li>Saves that page to your list.</li>
          <li>Sends you back here to find someone to go with.</li>
        </ol>
        <p className="note">Pick a page in the popup, save it, then find people for that plan.</p>
      </div>
      <article className="popup-sample" aria-label="Extension popup demo">
        <header>
          <strong className="brand-tiny">
            <img src="/orbit-logo.png" alt="Orbit" />
          </strong>
          <span>You</span>
        </header>
        <p className="sample-label">This tab</p>
        <div className="sample-tabs" role="tablist" aria-label="Open page">
          {EXTENSION_DEMO_TABS.map((page, pageIndex) => (
            <button
              key={page.url}
              type="button"
              role="tab"
              aria-selected={pageIndex === index}
              className={pageIndex === index ? "sample-tab on" : "sample-tab"}
              onClick={() => setIndex(pageIndex)}
            >
              {page.title}
            </button>
          ))}
        </div>
        <p className="sample-title">{tab.title}</p>
        <p className="sample-url">{tab.url}</p>
        <button type="button" onClick={() => setSavedUrl(tab.url)} disabled={saved}>
          {saved ? "Saved" : "Save to Orbit"}
        </button>
        {saved ? (
          <p className="sample-saved">
            Saved to Orbit.{" "}
            <a href="#try-seattle">Find people on Orbit</a>
          </p>
        ) : null}
      </article>
    </section>
  )
}

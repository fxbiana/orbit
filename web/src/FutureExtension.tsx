export function FutureExtension() {
  return (
    <section className="later" aria-labelledby="later-title">
      <div>
        <p className="eyebrow">Later</p>
        <h2 id="later-title">Save the page you already have open.</h2>
        <ol>
          <li>Uses the same account as Orbit on the web.</li>
          <li>Reads the title and URL of the tab you have open.</li>
          <li>Saves that page to your list.</li>
          <li>Later, asks the same API for Ticketmaster events near you that match your saved preferences.</li>
        </ol>
      </div>
      <article className="popup-sample" aria-label="Sample of the future extension popup">
        <header>
          <strong>Orbit</strong>
          <span>You</span>
        </header>
        <p className="sample-label">This tab</p>
        <p className="sample-title">Diwali recipes</p>
        <p className="sample-url">https://example.com/diwali</p>
        <p className="sample-button">Save page</p>
      </article>
    </section>
  )
}

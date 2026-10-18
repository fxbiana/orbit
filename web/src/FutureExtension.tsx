export function FutureExtension() {
  return (
    <section className="later" aria-labelledby="later-title">
      <div>
        <p className="eyebrow">Later</p>
        <h2 id="later-title">The extension saves the tab you already have open.</h2>
        <ol>
          <li>Same Clerk account as this site.</li>
          <li>It reads the title and URL of the current tab.</li>
          <li>It posts that page to the same ticket list.</li>
        </ol>
      </div>
      <article className="popup-sample" aria-label="Sample of the future extension popup">
        <header>
          <strong>Ticket Trapper</strong>
          <span>You</span>
        </header>
        <p className="sample-label">This tab</p>
        <p className="sample-title">Diwali recipes</p>
        <p className="sample-url">https://example.com/diwali</p>
        <p className="sample-button">Save ticket</p>
      </article>
    </section>
  )
}

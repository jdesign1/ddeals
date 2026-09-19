const APP_URL = "https://app.dodgydeal.co.nz";

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  );
}

const steps = [
  {
    number: "01",
    title: "Pick what you need",
    body: "Search everyday groceries or save the things you buy often.",
  },
  {
    number: "02",
    title: "Compare NZ supermarkets",
    body: "See current prices from Pak’nSave, New World, and Woolworths in one place.",
  },
  {
    number: "03",
    title: "Buy with confidence",
    body: "We look at price history so a bright yellow tag does not do all the convincing.",
  },
];

const reasons = [
  ["Real prices", "Current supermarket prices, gathered for New Zealand shoppers."],
  ["Useful history", "A discount is easier to judge when you can see what came before it."],
  ["Less guesswork", "Compare the same product across stores before you add it to the trolley."],
];

export default function Home() {
  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top" aria-label="Dodgy Deal home">
          <Mark />
          <span>Dodgy Deal</span>
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#why-dodgy-deal">Why Dodgy Deal</a>
          <a className="nav-cta" href={APP_URL}>Open the app <span aria-hidden="true">↗</span></a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> Made for Aotearoa</p>
          <h1>Know when a supermarket deal is actually a deal.</h1>
          <p className="hero-lede">
            Dodgy Deal compares everyday grocery prices across New Zealand supermarkets
            and shows the context behind the discount.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={APP_URL}>Open Dodgy Deal <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="quiet-note">Free to use · Built for Kiwi grocery shopping</p>
        </div>

        <div className="hero-card" aria-label="A Dodgy Deal product comparison example">
          <div className="card-topline"><span>Today’s trolley check</span><span className="live-pill"><i /> LIVE</span></div>
          <div className="product-row product-row-featured">
            <div className="product-icon product-icon-green">🥛</div>
            <div className="product-details"><strong>Standard Milk</strong><span>2L · compare stores</span></div>
            <span className="price-tag">$4.79</span>
          </div>
          <div className="store-list">
            <div><span className="store-name">Pak’nSave</span><strong>$4.79</strong><span className="best">LOWEST</span></div>
            <div><span className="store-name">New World</span><strong>$5.29</strong><span className="muted">+$0.50</span></div>
            <div><span className="store-name">Woolworths</span><strong>$5.49</strong><span className="muted">+$0.70</span></div>
          </div>
          <div className="history-callout"><span className="history-icon">↗</span><span><strong>Looks like a real saving</strong><br /><small>Price is below its usual range.</small></span></div>
          <div className="card-footnote">Prices change. We keep the context visible.</div>
        </div>
      </section>

      <section className="trust-strip" aria-label="What Dodgy Deal checks">
        <p>Grocery shopping should not require detective work.</p>
        <div><span>Pak’nSave</span><span>New World</span><span>Woolworths</span><span>Price history</span></div>
      </section>

      <section className="section" id="how-it-works">
        <div className="section-heading"><p className="eyebrow">A clearer way to shop</p><h2>Three steps from “is this good?” to “I know.”</h2></div>
        <div className="steps-grid">
          {steps.map((step) => <article className="step-card" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}
        </div>
      </section>

      <section className="section split-section" id="why-dodgy-deal">
        <div className="split-copy"><p className="eyebrow">Useful, without the noise</p><h2>More context. Fewer “special” surprises.</h2><p>Not every discount is dodgy, and not every bright ticket is a bargain. Dodgy Deal gives you the price comparison and history to make the call yourself.</p><a className="button button-dark" href={APP_URL}>Try it with your next shop <span aria-hidden="true">↗</span></a></div>
        <div className="reason-list">{reasons.map(([title, body], index) => <div className="reason" key={title}><span className="reason-check">{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
      </section>

      <section className="download-panel">
        <div><p className="eyebrow">Your smarter trolley starts here</p><h2>Take Dodgy Deal with you.</h2><p>Open the app in your browser now. Native iOS and Android experiences are on their way.</p></div>
        <a className="button button-light" href={APP_URL}>Open the app <span aria-hidden="true">↗</span></a>
      </section>

      <footer className="site-footer"><a className="wordmark" href="#top"><Mark /><span>Dodgy Deal</span></a><p>Better grocery decisions for Aotearoa.</p><div><a href="mailto:hello@dodgydeal.co.nz">Contact</a><a href={`${APP_URL}/privacy`}>Privacy</a><a href={`${APP_URL}/terms`}>Terms</a></div></footer>
    </main>
  );
}

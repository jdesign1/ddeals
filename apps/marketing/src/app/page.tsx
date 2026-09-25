import Image from "next/image";

const APP_URL = "https://app.dodgydeal.co.nz";
const BRAND_LOGO = "/logo.svg";

const firstFeatures = [
  {
    title: "Quick search",
    body: "Seen a special and not sure it’s a real saving? Search the product to get a quick verdict.",
    image: "/images/features/quick-search.webp",
    imageAlt: "Stylised Dodgy Deal search example for tomatoes",
  },
  {
    title: "Price history",
    body: "See the last 90 days of prices to know whether today’s deal is genuinely low—or worth waiting for.",
    image: "/images/features/price-history-graph-green.webp",
    imageAlt: "Stylised Dodgy Deal price history graph",
    imageClassName: "feature-image-graph",
  },
  {
    title: "Deal assessments",
    body: "Get a quick Real or Dodgy verdict based on the product’s price history.",
    image: "/images/features/deal-assessments.webp",
    imageAlt: "Stylised Dodgy Deal assessment showing a Real Deal badge",
  },
];

const secondFeatures = [
  {
    title: "Cheaper options",
    body: "See cheaper alternatives across stores and how much you could save.",
    image: "/images/features/cheaper-options.webp",
    imageAlt: "Stylised Dodgy Deal carousel comparing cheaper milk options",
  },
  {
    title: "Shopping tips",
    body: "Use the 90-day view to see whether it’s better to buy now or wait.",
    image: "/images/features/shopping-tips.webp",
    imageAlt: "Stylised Dodgy Deal 90-day price tips grid",
  },
  {
    title: "Deal statistics",
    body: "See how prices move over time and which specials are worth watching.",
    image: "/images/features/deal-statistics-graph-green.webp",
    imageAlt: "Stylised Dodgy Deal price changes graph",
    imageClassName: "feature-image-graph",
  },
];

function Logo({ animated = false }: { animated?: boolean }) {
  return (
    <span className="logo-lockup">
      <Image src={BRAND_LOGO} alt="" width={38} height={38} priority unoptimized className={animated ? "logo-mascot" : undefined} />
      <span>Dodgy deal</span>
    </span>
  );
}

function StoreBadge() {
  return (
    <button className="store-badge" type="button" disabled aria-label="Download on the App Store, coming soon">
      <Image
        src="/images/download-on-the-app-store.svg"
        alt="Download on the App Store — coming soon"
        width={120}
        height={40}
        unoptimized
      />
    </button>
  );
}

function HeroAnimation() {
  return (
    <div
      className="hero-animation"
      role="img"
      aria-label="Dodgy Deal mascot moving into view to inspect the deals on the app"
    >
      <div className="hero-animation__stage">
        <Image
          src="/images/app-hero-background.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 760px) 100vw, 430px"
          unoptimized
          className="hero-animation__plate"
          aria-hidden="true"
        />
        <div className="hero-animation__mascot-mask" aria-hidden="true">
          <Image
            src="/images/mascot-head.webp"
            alt=""
            width={640}
            height={426}
            sizes="(max-width: 760px) 25vw, 110px"
            unoptimized
            className="hero-animation__mascot"
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ title, body, image, imageAlt, imageClassName }: { title: string; body: string; image: string; imageAlt: string; imageClassName?: string }) {
  return (
    <article className="feature-card">
      <div className={`feature-image${imageClassName ? ` ${imageClassName}` : ""}`}>
        <Image
          src={image}
          alt={imageAlt}
          width={560}
          height={360}
          sizes="(max-width: 760px) calc(100vw - 40px), 31vw"
          unoptimized
        />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export default function Home() {
  return (
    <main id="top">
      <header className="site-header">
        <a href="#top" aria-label="Dodgy deal home"><Logo animated /></a>
        <nav className="header-nav" aria-label="Primary navigation">
          <a className="header-link" href="#how-it-works">How does it work</a>
          <a className="header-link" href="#faq">FAQs</a>
        </nav>
      </header>

      <section className="download-hero" aria-labelledby="hero-title">
        <div className="download-hero-inner">
          <div className="download-copy">
            <h1 id="hero-title">Download the Dodgy deal app</h1>
            <p>Check whether a supermarket special is a real saving—or just a dodgy deal.</p>
            <StoreBadge />
          </div>
          <div className="download-visual">
            <HeroAnimation />
          </div>
        </div>
      </section>

      <section className="feature-section" id="how-it-works" aria-labelledby="first-feature-title">
        <div className="section-intro">
          <h2 id="first-feature-title">Find the real specials</h2>
          <p>Check supermarket prices across New Zealand and see what today’s special is really worth.</p>
        </div>
        <div className="feature-grid">
          {firstFeatures.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section className="feature-section feature-section-secondary" aria-labelledby="second-feature-title">
        <div className="section-intro">
          <h2 id="second-feature-title">Shop smarter with price context</h2>
          <p>Compare prices, spot patterns, and make more confident choices at the shelf.</p>
        </div>
        <div className="feature-grid">
          {secondFeatures.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section className="closing-cta" aria-labelledby="cta-title">
        <h2 id="cta-title">Are your supermarket specials actually <span>saving you money?</span></h2>
        <p>Specials change every day. Dodgy deal helps you see what’s genuinely worth buying.</p>
        <StoreBadge />
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div className="section-intro faq-intro">
          <h2 id="faq-title">Frequently asked questions</h2>
          <p>Got a question? Here’s the lowdown on finding better supermarket specials.</p>
        </div>
        <div className="faq-list">
          <details className="faq-item">
            <summary>What is Dodgy Deal?</summary>
            <p>Dodgy Deal helps you figure out whether a supermarket special is a genuine saving—or just a “special” price that isn’t quite the bargain it’s made out to be.</p>
          </details>
          <details className="faq-item">
            <summary>How does Dodgy Deal decide if a deal is genuine?</summary>
            <p>It checks today’s price against the product’s recent price history, so you can see whether you’re getting a decent saving, a small discount, or a special that looks a bit dodgy.</p>
          </details>
          <details className="faq-item">
            <summary>What do “Real Deal”, “Fair Deal”, and “Dodgy Deal” mean?</summary>
            <p>A Real Deal looks like a worthwhile saving. A Fair Deal is a genuine discount, but not a huge one. A Dodgy Deal means the special may not be the saving it first appears to be.</p>
          </details>
          <details className="faq-item">
            <summary>Which supermarkets does Dodgy Deal cover?</summary>
            <p>Dodgy Deal compares products and prices from participating supermarkets across Aotearoa. What’s available can vary depending on the supermarket and the product.</p>
          </details>
          <details className="faq-item">
            <summary>Can I compare prices between supermarkets?</summary>
            <p>Yep. Search for a product to compare current prices and find cheaper options at other supermarkets—handy when you’re trying to make the grocery budget stretch a bit further.</p>
          </details>
          <details className="faq-item">
            <summary>How much price history does the app show?</summary>
            <p>The app uses up to 90 days of price history, giving you a better idea of how a product’s price has moved over time—not just what it costs today.</p>
          </details>
          <details className="faq-item">
            <summary>What if there isn’t enough price history for a product?</summary>
            <p>Sometimes Dodgy Deal will say it’s still checking rather than make a call. That simply means we need a bit more history before we can give you a useful, reliable verdict.</p>
          </details>
          <details className="faq-item">
            <summary>Can Dodgy Deal tell me whether to buy now or wait?</summary>
            <p>It gives you the price context and shopping tips to help decide whether today’s price is worth popping in the trolley—or whether it might pay to wait.</p>
          </details>
        </div>
      </section>

      <footer className="site-footer">
        <Logo />
        <div className="footer-links"><a href="mailto:hello@dodgydeal.co.nz">Contact</a><a href={`${APP_URL}/privacy`}>Privacy</a><a href={`${APP_URL}/terms`}>Terms</a></div>
      </footer>
    </main>
  );
}

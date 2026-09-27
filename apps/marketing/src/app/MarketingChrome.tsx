import Image from "next/image";
import Link from "next/link";

const BRAND_LOGO = "/logo.svg";

export function Logo({ animated = false }: { animated?: boolean }) {
  return (
    <span className="logo-lockup">
      <Image
        src={BRAND_LOGO}
        alt=""
        width={38}
        height={38}
        priority={animated}
        unoptimized
        className={animated ? "logo-mascot" : undefined}
      />
      <span>Dodgy deal</span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" aria-label="Dodgy deal home">
        <Logo animated />
      </Link>
      <nav className="header-nav" aria-label="Primary navigation">
        <Link className="header-link" href="/#how-it-works">
          How does it work
        </Link>
        <Link className="header-link" href="/#faq">
          FAQs
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/" aria-label="Dodgy deal home">
        <Logo />
      </Link>
      <nav className="footer-links" aria-label="Footer navigation">
        <a href="mailto:hello@dodgydeal.co.nz">Contact</a>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}

import Image from "next/image";
import Link from "next/link";
import WinkMascot from "../../../mobile/src/components/WinkMascot";

const BRAND_LOGO = "/logo.svg";

export function Logo({ animated = false }: { animated?: boolean }) {
  return (
    <div className="logo-lockup">
      {animated ? (
        <WinkMascot className="wink-mascot--search mascot-wave marketing-header-mascot" />
      ) : (
        <Image src={BRAND_LOGO} alt="" width={38} height={38} unoptimized />
      )}
      <span>Dodgy deal</span>
    </div>
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

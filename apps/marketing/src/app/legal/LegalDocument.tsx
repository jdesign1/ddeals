import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "../MarketingChrome";

type LegalDocumentType = "privacy" | "terms";

const documentDetails = {
  privacy: {
    eyebrow: "Privacy policy",
    title: "Your privacy matters",
    intro:
      "This Privacy Policy explains how Dodgy Deal collects, uses, stores, and protects personal information when you use the Dodgy Deal app and related services. It is intended to be read alongside the Privacy Act 2020 and the Information Privacy Principles (IPPs).",
    notice:
      "This draft must be completed with the operator’s legal name, address, privacy email, and confirmed service-provider details before Dodgy Deal is released publicly.",
    updated: "30 August 2026",
  },
  terms: {
    eyebrow: "Terms of use",
    title: "Terms of use",
    intro:
      "These Terms of Use explain the rules that apply when you use the Dodgy Deal app and related services. By using Dodgy Deal, you agree to these terms. If you do not agree, please do not use the app.",
    notice:
      "This draft must be completed with the operator’s legal name, address, contact details, and any confirmed paid-service terms before Dodgy Deal is released publicly.",
    updated: "30 August 2026",
  },
} satisfies Record<LegalDocumentType, { eyebrow: string; title: string; intro: string; notice: string; updated: string }>;

const privacySections = [
  "Who we are",
  "What personal information we collect",
  "How and why we collect and use information",
  "Information requested during sign-up",
  "Deal and retailer information",
  "Who we share information with",
  "Storage, security, and overseas processing",
  "How long we keep information",
  "Your privacy rights",
  "Privacy incidents and complaints",
  "Changes to this policy",
];

const termsSections = [
  "Who we are",
  "What Dodgy Deal provides",
  "Prices, promotions, and deal ratings",
  "Eligibility and accounts",
  "Acceptable use",
  "Your content and feedback",
  "Intellectual property and third-party material",
  "Third-party websites and services",
  "Availability and changes",
  "Fees and purchases",
  "Consumer rights",
  "Liability",
  "Suspension and ending use",
  "Privacy",
  "Complaints and contact",
  "Changes to these terms",
  "New Zealand law",
];

function BulletList({ children }: { children: ReactNode }) {
  return <ul className="legal-bullets">{children}</ul>;
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="legal-contact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="legal-section" id={id}>
      <h2>{title}</h2>
      <div className="legal-copy">{children}</div>
    </section>
  );
}

function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="legal-notice" aria-label="Draft notice">
      <p className="legal-notice-label">Please read</p>
      <p>{children}</p>
    </aside>
  );
}

function LegalIndex({ type }: { type: LegalDocumentType }) {
  const sections = type === "privacy" ? privacySections : termsSections;
  return (
    <nav className="legal-index" aria-label="On this page">
      <p className="legal-index-title">On this page</p>
      <ol>
        {sections.map((title, index) => (
          <li key={title}>
            <a href={`#section-${index + 1}`}>{title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PrivacyContent() {
  return (
    <>
      <LegalSection id="section-1" title="1. Who we are">
        <p>
          Dodgy Deal is operated by <strong>[insert legal entity or individual name]</strong> (referred to as “Dodgy Deal”, “we”, “us”, or “our”).
        </p>
        <dl className="legal-contact-card">
          <ContactRow label="Operator" value="[insert legal entity or individual name]" />
          <ContactRow label="Address" value="[insert physical or postal address]" />
          <ContactRow label="Privacy officer" value="[insert name or role]" />
          <ContactRow label="Privacy contact" value="[insert privacy email address]" />
        </dl>
        <p>
          Our Privacy Officer oversees privacy compliance, access and correction requests, privacy complaints, and contact with the Office of the Privacy Commissioner.
        </p>
      </LegalSection>

      <LegalSection id="section-2" title="2. What personal information we collect">
        <p>Depending on how you use Dodgy Deal, we may collect:</p>
        <BulletList>
          <li><strong>Account information:</strong> your email address, password credentials handled by our authentication provider, name, date of birth, and NZ postcode.</li>
          <li><strong>Shopping activity:</strong> saved lists, saved list items, products you check, and your deal-check history.</li>
          <li><strong>Support information:</strong> information you choose to send us, such as a support request or a report about an incorrect deal.</li>
          <li><strong>Technical information:</strong> account/session identifiers, security information, and technical logs such as IP address, device, browser, and error information where these are collected by the app, hosting provider, or database provider.</li>
          <li><strong>Local app information:</strong> your card-layout preference and locally cached catalogue data. These are stored on your device to make the app work smoothly and are not, by themselves, a user profile.</li>
        </BulletList>
        <p>
          You can browse public deal information without creating an account. An account is needed for features such as saving lists and retaining your deal-check history. At present, we do not intentionally collect precise location, contacts, payment information, advertising identifiers, or biometric information. If that changes, we will update this policy and provide any required permission or collection notice before collecting it.
        </p>
      </LegalSection>

      <LegalSection id="section-3" title="3. How and why we collect and use information">
        <p>We collect information directly from you when you:</p>
        <BulletList>
          <li>create or use an account;</li>
          <li>save a list, check a deal, or use another account feature;</li>
          <li>contact us or submit a report; or</li>
          <li>use the app, which may generate technical and security information.</li>
        </BulletList>
        <p>We use personal information to:</p>
        <BulletList>
          <li>create, authenticate, secure, and maintain your account;</li>
          <li>save and display your lists and deal-check history;</li>
          <li>provide, troubleshoot, maintain, and improve Dodgy Deal;</li>
          <li>respond to support requests and investigate reported errors or misuse;</li>
          <li>protect the app, users, and our providers from fraud, abuse, and security incidents; and</li>
          <li>comply with legal obligations or respond to lawful requests.</li>
        </BulletList>
        <p>
          We will not use your personal information for a new purpose that is incompatible with the purpose described here without first providing an appropriate notice or obtaining permission where required. We take reasonable steps to keep personal information accurate, complete, up to date, and not misleading before using it.
        </p>
      </LegalSection>

      <LegalSection id="section-4" title="4. Information requested during sign-up">
        <p>
          Email and password are needed to create and secure an account. The sign-up form also currently requests your name, date of birth, and NZ postcode. These fields are stored with your account details. They are not currently used to create personalised deal recommendations.
        </p>
        <p>
          We will only retain and use this information for a clear, lawful purpose. If a field is not needed for the account feature you want to use, you can continue using Dodgy Deal without an account instead.
        </p>
      </LegalSection>

      <LegalSection id="section-5" title="5. Deal and retailer information">
        <p>
          Dodgy Deal displays product, retailer, store, image, price, and promotion information from public or retailer-related sources. This catalogue information is generally about products and prices rather than identifiable people, so it is not normally your personal information.
        </p>
        <p>
          We do not use retailer information to create a personal profile about you. If we ever receive personal information about an identifiable person from another organisation, we will provide any notice required by the Privacy Act 2020, including the source, purpose, intended recipients, and access/correction rights where the indirect-collection rules apply.
        </p>
      </LegalSection>

      <LegalSection id="section-6" title="6. Who we share information with">
        <p>We may disclose personal information only when reasonably necessary for the purposes in this policy, including to:</p>
        <BulletList>
          <li>service providers that host our database, authentication, app, website, email, or technical systems. At present, Supabase provides our database and authentication services;</li>
          <li>people or providers who help us respond to support, security, or legal issues;</li>
          <li>law enforcement, regulators, courts, or other parties where disclosure is required or authorised by law; and</li>
          <li>a successor or professional adviser if Dodgy Deal is reorganised, sold, or transferred.</li>
        </BulletList>
        <p>We do not sell or rent your personal information. We require service providers to handle information only as necessary for the services they provide and to protect it appropriately.</p>
      </LegalSection>

      <LegalSection id="section-7" title="7. Storage, security, and overseas processing">
        <p>
          Personal information is stored using access-controlled systems and reasonable safeguards designed to prevent loss, misuse, unauthorised access, disclosure, alteration, or destruction. No internet service is completely secure, so we cannot promise absolute security.
        </p>
        <p>
          Our database, authentication, hosting, and other technology providers may store or process information outside New Zealand. Before release, we will name the providers used in production and confirm the countries or safeguards that apply. We will only make an overseas disclosure in accordance with Information Privacy Principle 12, including by using comparable protections, appropriate contractual safeguards, or informed authorisation where required.
        </p>
      </LegalSection>

      <LegalSection id="section-8" title="8. How long we keep information">
        <p>
          We keep personal information only for as long as it is needed for the purpose for which it was collected, to provide the service, resolve disputes, maintain security, or meet a legal obligation. We periodically review stored information and securely delete or de-identify it when it is no longer needed.
        </p>
        <p>
          When you delete your account, we will delete or de-identify your account information and associated lists and deal-check history, subject to information we are legally required or reasonably permitted to retain. Local app data may remain on your device until you clear the app or its storage.
        </p>
      </LegalSection>

      <LegalSection id="section-9" title="9. Your privacy rights">
        <p>
          Under the Privacy Act 2020, you can ask us for the personal information we hold about you and ask us to correct information that is wrong, incomplete, or misleading. You can also ask questions or complain about how we handle your information.
        </p>
        <p>
          Email your request to <strong>[insert privacy email address]</strong>. Please tell us what you are requesting and provide enough information for us to confirm your identity and locate the relevant records. We will respond within the timeframe required by the Privacy Act; access requests ordinarily need a response within 20 working days, subject to lawful extensions or withholding grounds.
        </p>
        <p>
          You can delete your Dodgy Deal account from the in-app account settings when that function is available. If you cannot access the app, contact the Privacy Officer using the details above and request account deletion.
        </p>
      </LegalSection>

      <LegalSection id="section-10" title="10. Privacy incidents and complaints">
        <p>
          If we become aware of a privacy breach, we will assess the risk of serious harm, contain and remediate the incident, keep appropriate records, and notify the Privacy Commissioner and affected people when notification is required by the Privacy Act 2020.
        </p>
        <p>
          Please contact our Privacy Officer first so we can investigate and try to resolve your concern. If you are not satisfied with our response, you can contact the Office of the Privacy Commissioner at <a href="https://www.privacy.org.nz/" target="_blank" rel="noreferrer">privacy.org.nz</a>.
        </p>
      </LegalSection>

      <LegalSection id="section-11" title="11. Changes to this policy">
        <p>
          We may update this policy when our services, data practices, providers, or legal obligations change. We will update the date at the top of this page and, where a change is material, provide a prominent notice in the app or by email where appropriate.
        </p>
      </LegalSection>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <LegalSection id="section-1" title="1. Who we are">
        <p>Dodgy Deal is operated by <strong>[insert legal entity or individual name]</strong> (referred to as “Dodgy Deal”, “we”, “us”, or “our”).</p>
        <dl className="legal-contact-card">
          <ContactRow label="Operator" value="[insert legal entity or individual name]" />
          <ContactRow label="Address" value="[insert physical or postal address]" />
          <ContactRow label="Support contact" value="hello@dodgydeal.co.nz" />
        </dl>
      </LegalSection>

      <LegalSection id="section-2" title="2. What Dodgy Deal provides">
        <p>Dodgy Deal helps shoppers compare supermarket prices and understand whether a promotion appears to be a genuine saving based on available price history. The app may provide search, product comparisons, deal ratings, price history, saved lists, and deal-check history.</p>
        <p>Dodgy Deal is not a supermarket, retailer, seller, or agent for a retailer. We do not take orders, process payments, deliver products, or make the sale of a product shown in the app. Any purchase you make is with the relevant retailer and is subject to that retailer’s own terms, price, availability, and refund policies.</p>
      </LegalSection>

      <LegalSection id="section-3" title="3. Prices, promotions, and deal ratings">
        <p>We work to present useful and accurate information, but retailer prices, stock, product descriptions, store availability, and promotion dates can change. Information may be delayed, incomplete, unavailable, or different between stores.</p>
        <p>Deal ratings and price-history comparisons are estimates based on the data available to us. They are informational only and are not a promise that a product is the cheapest option, a recommendation to buy, or a statement made by the retailer. Check the retailer’s current price, promotion conditions, unit size, stock, and checkout total before purchasing.</p>
        <p>We take reasonable care with claims shown in the app and will investigate reports of incorrect information. Please contact us if you find a price, promotion, image, or product detail that needs correction.</p>
      </LegalSection>

      <LegalSection id="section-4" title="4. Eligibility and accounts">
        <p>You must be at least 13 years old to create an account. If you are under 18, you should use the app with the knowledge and permission of a parent or guardian.</p>
        <p>You must provide information that is accurate and keep your sign-in details secure. Do not share your password, use another person’s account, or create an account for someone else without permission. Tell us promptly if you believe your account has been accessed without authorisation.</p>
        <p>You can browse public deal information without an account. An account is needed for features such as saving lists and retaining your deal-check history.</p>
      </LegalSection>

      <LegalSection id="section-5" title="5. Acceptable use">
        <p>You must use Dodgy Deal lawfully and respectfully. You must not:</p>
        <BulletList>
          <li>break any law or infringe another person’s rights;</li>
          <li>interfere with, overload, probe, or bypass security controls on the app or its services;</li>
          <li>use bots, scraping, automated requests, or other methods to copy or harvest the service without our written permission;</li>
          <li>upload or send malicious code, spam, or content that is unlawful, abusive, threatening, or misleading; or</li>
          <li>use Dodgy Deal to build or train a competing price database without our permission.</li>
        </BulletList>
      </LegalSection>

      <LegalSection id="section-6" title="6. Your content and feedback">
        <p>If you send us feedback, corrections, or other material, you confirm that you have the right to provide it. You give us permission to use, reproduce, adapt, and share that material as reasonably needed to operate, improve, secure, and promote Dodgy Deal.</p>
        <p>Please do not send us confidential information or another person’s personal information unless it is necessary and you have permission to do so. We may remove content that breaches these terms or creates a legal, security, or safety risk.</p>
      </LegalSection>

      <LegalSection id="section-7" title="7. Intellectual property and third-party material">
        <p>Dodgy Deal’s software, design, name, branding, and original content belong to us or our licensors. Except as allowed by law or these terms, you must not copy, modify, distribute, sell, reverse engineer, or create derivative works from them.</p>
        <p>Product names, retailer names, logos, images, and other third-party material belong to their respective owners. We do not claim ownership of those materials. They are displayed for identification, comparison, or service purposes under applicable permissions, terms, or other legal rights.</p>
        <p>If you believe material in the app infringes your rights, contact us with enough information for us to investigate.</p>
      </LegalSection>

      <LegalSection id="section-8" title="8. Third-party websites and services">
        <p>Dodgy Deal may link to retailer websites or rely on third-party services to provide hosting, authentication, data, or other functionality. Those services are controlled by their own operators and terms. We are not responsible for third-party content, availability, security, pricing, or practices.</p>
        <p>A link or reference does not mean that Dodgy Deal endorses a retailer, product, service, or claim. Review the relevant third party’s terms and privacy information before using its service.</p>
      </LegalSection>

      <LegalSection id="section-9" title="9. Availability and changes">
        <p>We may update, suspend, restrict, or discontinue all or part of Dodgy Deal, including individual features, data sources, or retailer coverage. We may do this for maintenance, security, legal, commercial, or operational reasons.</p>
        <p>We do not guarantee that Dodgy Deal will always be available, error-free, compatible with every device, or free from interruptions. We will take reasonable care to maintain the service and address material problems that are reported to us.</p>
      </LegalSection>

      <LegalSection id="section-10" title="10. Fees and purchases">
        <p>Dodgy Deal is currently provided without a subscription or in-app purchase. We do not currently process purchases for retailer products.</p>
        <p>If we introduce paid features, subscriptions, advertising, or another commercial model, we will provide the relevant price, renewal, cancellation, refund, and other material terms before you commit to pay.</p>
      </LegalSection>

      <LegalSection id="section-11" title="11. Consumer rights">
        <p>Nothing in these terms removes, restricts, or replaces a right or remedy that cannot lawfully be excluded. This includes rights under the New Zealand Fair Trading Act 1986 and, where it applies, the Consumer Guarantees Act 1993.</p>
        <p>New Zealand consumer law may apply to digital products and services, including free smartphone apps. If you believe Dodgy Deal has not met an applicable legal guarantee, contact us and explain the problem so we can investigate and try to put it right.</p>
      </LegalSection>

      <LegalSection id="section-12" title="12. Liability">
        <p>To the maximum extent permitted by law, we are not responsible for losses that result from a retailer’s price, stock, product, promotion, conduct, website, or transaction, or from your decision to rely on information displayed in Dodgy Deal.</p>
        <p>We are also not responsible for loss caused by your misuse of the app, unauthorised access to your account resulting from your failure to protect your sign-in details, or events outside our reasonable control.</p>
        <p>This section does not limit liability or consumer rights where doing so would be unlawful, including for misleading conduct, fraud, or rights and remedies that apply under New Zealand consumer law.</p>
      </LegalSection>

      <LegalSection id="section-13" title="13. Suspension and ending use">
        <p>You can stop using Dodgy Deal at any time. You can request account deletion as described in our <Link href="/privacy">Privacy policy</Link>.</p>
        <p>We may suspend or end access if reasonably necessary to protect the app, users, providers, or our legal rights, or if you materially breach these terms. We will act proportionately where practical and will not use suspension or termination to remove rights that cannot be excluded.</p>
      </LegalSection>

      <LegalSection id="section-14" title="14. Privacy">
        <p>Our <Link href="/privacy">Privacy policy</Link> explains how we collect, use, store, disclose, and protect personal information.</p>
      </LegalSection>

      <LegalSection id="section-15" title="15. Complaints and contact">
        <p>If you have a question, complaint, or report about the app, a deal, or these terms, contact us at <a href="mailto:hello@dodgydeal.co.nz">hello@dodgydeal.co.nz</a>. We will review the issue and try to resolve it fairly.</p>
        <p>If your concern relates to privacy, use the contact process in our Privacy policy. You may also contact the relevant New Zealand regulator or use any other legal avenue available to you.</p>
      </LegalSection>

      <LegalSection id="section-16" title="16. Changes to these terms">
        <p>We may update these terms when the app, our business, or our legal obligations change. We will update the date at the top of this page. If a change is material, we will provide a prominent notice in the app or by email where appropriate. Continuing to use Dodgy Deal after an updated version takes effect means you accept the updated terms, except where the law requires a different process.</p>
      </LegalSection>

      <LegalSection id="section-17" title="17. New Zealand law">
        <p>These terms are governed by New Zealand law. Subject to any mandatory consumer rights and dispute-resolution process, the New Zealand courts have jurisdiction over disputes relating to Dodgy Deal.</p>
      </LegalSection>
    </>
  );
}

export function LegalDocument({ type }: { type: LegalDocumentType }) {
  const details = documentDetails[type];
  const isPrivacy = type === "privacy";

  return (
    <main className="legal-page">
      <SiteHeader />
      <div className="legal-hero">
        <div className="legal-hero-inner">
          <p className="legal-eyebrow">{details.eyebrow}</p>
          <h1>{details.title}</h1>
          <p className="legal-lede">{details.intro}</p>
          <p className="legal-updated">Last updated: {details.updated}</p>
        </div>
      </div>
      <div className="legal-layout">
        <LegalIndex type={type} />
        <article className="legal-document">
          <LegalNotice>{details.notice}</LegalNotice>
          {isPrivacy ? <PrivacyContent /> : <TermsContent />}
          <section className="legal-related">
            <h2>Related information</h2>
            <div>
              {isPrivacy ? (
                <a href="https://www.privacy.org.nz/privacy-principles/" target="_blank" rel="noreferrer">
                  Read the New Zealand Privacy Commissioner’s privacy principles
                </a>
              ) : (
                <Link href="/privacy">Read our Privacy policy</Link>
              )}
            </div>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}

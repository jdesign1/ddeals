"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { usePageHeader } from "@/lib/header-context";

/**
 * Public-facing Terms of Use draft for the app.
 *
 * The operator, address, contact details, and any future paid-service terms
 * must be confirmed before release. The wording is deliberately plain and
 * preserves New Zealand consumer rights rather than attempting to contract
 * out of the Fair Trading Act or Consumer Guarantees Act.
 */
export default function TermsPage() {
  const router = useRouter();
  usePageHeader("Terms of use", () => router.back());

  return (
    <main className="flex flex-col gap-5 px-5 py-6 pb-10">
      <section className="rounded-2xl border border-dodgy-200 bg-dodgy-50 p-5 shadow-sm">
        <p className="text-[11px] font-black tracking-widest text-dodgy-800">Please read</p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          This draft must be completed with the operator&rsquo;s legal name, address, contact details, and any
          confirmed paid-service terms before Dodgy Deal is released publicly.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-stone-500">Last updated: 30 August 2026</p>
        <h1 className="mt-2 font-display text-xl font-black text-stone-900">Terms of use</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          These Terms of Use explain the rules that apply when you use the Dodgy Deal app and related services. By
          using Dodgy Deal, you agree to these terms. If you do not agree, please do not use the app.
        </p>
      </section>

      <TermsSection title="1. Who we are">
        <p>
          Dodgy Deal is operated by <strong>[insert legal entity or individual name]</strong> (referred to as
          “Dodgy Deal”, “we”, “us”, or “our”).
        </p>
        <dl className="mt-3 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
          <ContactRow label="Operator" value="[insert legal entity or individual name]" />
          <ContactRow label="Address" value="[insert physical or postal address]" />
          <ContactRow label="Support contact" value="dodgydealnz@gmail.com" />
        </dl>
      </TermsSection>

      <TermsSection title="2. What Dodgy Deal provides">
        <p>
          Dodgy Deal helps shoppers compare supermarket prices and understand whether a promotion appears to be a
          genuine saving based on available price history. The app may provide search, product comparisons, deal
          ratings, price history, saved lists, and deal-check history.
        </p>
        <p className="mt-3">
          Dodgy Deal is not a supermarket, retailer, seller, or agent for a retailer. We do not take orders, process
          payments, deliver products, or make the sale of a product shown in the app. Any purchase you make is with the
          relevant retailer and is subject to that retailer&rsquo;s own terms, price, availability, and refund policies.
        </p>
      </TermsSection>

      <TermsSection title="3. Prices, promotions, and deal ratings">
        <p>
          We work to present useful and accurate information, but retailer prices, stock, product descriptions, store
          availability, and promotion dates can change. Information may be delayed, incomplete, unavailable, or
          different between stores.
        </p>
        <p className="mt-3">
          Deal ratings and price-history comparisons are estimates based on the data available to us. They are
          informational only and are not a promise that a product is the cheapest option, a recommendation to buy, or a
          statement made by the retailer. Check the retailer&rsquo;s current price, promotion conditions, unit size,
          stock, and checkout total before purchasing.
        </p>
        <p className="mt-3">
          We take reasonable care with claims shown in the app and will investigate reports of incorrect information.
          Please contact us if you find a price, promotion, image, or product detail that needs correction.
        </p>
      </TermsSection>

      <TermsSection title="4. Eligibility and accounts">
        <p>
          You must be at least 13 years old to create an account. If you are under 18, you should use the app with the
          knowledge and permission of a parent or guardian.
        </p>
        <p className="mt-3">
          You must provide information that is accurate and keep your sign-in details secure. Do not share your
          password, use another person&rsquo;s account, or create an account for someone else without permission. Tell
          us promptly if you believe your account has been accessed without authorisation.
        </p>
        <p className="mt-3">
          You can browse public deal information without an account. An account is needed for features such as saving
          lists and retaining your deal-check history.
        </p>
      </TermsSection>

      <TermsSection title="5. Acceptable use">
        <p>You must use Dodgy Deal lawfully and respectfully. You must not:</p>
        <BulletList>
          <li>break any law or infringe another person&rsquo;s rights;</li>
          <li>interfere with, overload, probe, or bypass security controls on the app or its services;</li>
          <li>use bots, scraping, automated requests, or other methods to copy or harvest the service without our written permission;</li>
          <li>upload or send malicious code, spam, or content that is unlawful, abusive, threatening, or misleading; or</li>
          <li>use Dodgy Deal to build or train a competing price database without our permission.</li>
        </BulletList>
      </TermsSection>

      <TermsSection title="6. Your content and feedback">
        <p>
          If you send us feedback, corrections, or other material, you confirm that you have the right to provide it.
          You give us permission to use, reproduce, adapt, and share that material as reasonably needed to operate,
          improve, secure, and promote Dodgy Deal.
        </p>
        <p className="mt-3">
          Please do not send us confidential information or another person&rsquo;s personal information unless it is
          necessary and you have permission to do so. We may remove content that breaches these terms or creates a
          legal, security, or safety risk.
        </p>
      </TermsSection>

      <TermsSection title="7. Intellectual property and third-party material">
        <p>
          Dodgy Deal&rsquo;s software, design, name, branding, and original content belong to us or our licensors.
          Except as allowed by law or these terms, you must not copy, modify, distribute, sell, reverse engineer, or
          create derivative works from them.
        </p>
        <p className="mt-3">
          Product names, retailer names, logos, images, and other third-party material belong to their respective
          owners. We do not claim ownership of those materials. They are displayed for identification, comparison, or
          service purposes under applicable permissions, terms, or other legal rights.
        </p>
        <p className="mt-3">
          If you believe material in the app infringes your rights, contact us with enough information for us to
          investigate.
        </p>
      </TermsSection>

      <TermsSection title="8. Third-party websites and services">
        <p>
          Dodgy Deal may link to retailer websites or rely on third-party services to provide hosting, authentication,
          data, or other functionality. Those services are controlled by their own operators and terms. We are not
          responsible for third-party content, availability, security, pricing, or practices.
        </p>
        <p className="mt-3">
          A link or reference does not mean that Dodgy Deal endorses a retailer, product, service, or claim. Review the
          relevant third party&rsquo;s terms and privacy information before using its service.
        </p>
      </TermsSection>

      <TermsSection title="9. Availability and changes">
        <p>
          We may update, suspend, restrict, or discontinue all or part of Dodgy Deal, including individual features,
          data sources, or retailer coverage. We may do this for maintenance, security, legal, commercial, or
          operational reasons.
        </p>
        <p className="mt-3">
          We do not guarantee that Dodgy Deal will always be available, error-free, compatible with every device, or
          free from interruptions. We will take reasonable care to maintain the service and address material problems
          that are reported to us.
        </p>
      </TermsSection>

      <TermsSection title="10. Fees and purchases">
        <p>
          Dodgy Deal is currently provided without a subscription or in-app purchase. We do not currently process
          purchases for retailer products.
        </p>
        <p className="mt-3">
          If we introduce paid features, subscriptions, advertising, or another commercial model, we will provide the
          relevant price, renewal, cancellation, refund, and other material terms before you commit to pay.
        </p>
      </TermsSection>

      <TermsSection title="11. Consumer rights">
        <p>
          Nothing in these terms removes, restricts, or replaces a right or remedy that cannot lawfully be excluded.
          This includes rights under the New Zealand Fair Trading Act 1986 and, where it applies, the Consumer
          Guarantees Act 1993.
        </p>
        <p className="mt-3">
          New Zealand consumer law may apply to digital products and services, including free smartphone apps. If you
          believe Dodgy Deal has not met an applicable legal guarantee, contact us and explain the problem so we can
          investigate and try to put it right.
        </p>
      </TermsSection>

      <TermsSection title="12. Liability">
        <p>
          To the maximum extent permitted by law, we are not responsible for losses that result from a retailer&rsquo;s
          price, stock, product, promotion, conduct, website, or transaction, or from your decision to rely on
          information displayed in Dodgy Deal.
        </p>
        <p className="mt-3">
          We are also not responsible for loss caused by your misuse of the app, unauthorised access to your account
          resulting from your failure to protect your sign-in details, or events outside our reasonable control.
        </p>
        <p className="mt-3">
          This section does not limit liability or consumer rights where doing so would be unlawful, including for
          misleading conduct, fraud, or rights and remedies that apply under New Zealand consumer law.
        </p>
      </TermsSection>

      <TermsSection title="13. Suspension and ending use">
        <p>
          You can stop using Dodgy Deal at any time. You can request account deletion as described in our{" "}
          <Link href="/privacy" className="font-bold text-ink-600 underline underline-offset-2">
            Privacy policy
          </Link>
          .
        </p>
        <p className="mt-3">
          We may suspend or end access if reasonably necessary to protect the app, users, providers, or our legal
          rights, or if you materially breach these terms. We will act proportionately where practical and will not use
          suspension or termination to remove rights that cannot be excluded.
        </p>
      </TermsSection>

      <TermsSection title="14. Privacy">
        <p>
          Our{" "}
          <Link href="/privacy" className="font-bold text-ink-600 underline underline-offset-2">
            Privacy policy
          </Link>{" "}
          explains how we collect, use, store, disclose, and protect personal information.
        </p>
      </TermsSection>

      <TermsSection title="15. Complaints and contact">
        <p>
          If you have a question, complaint, or report about the app, a deal, or these terms, contact us at{" "}
          <a href="mailto:dodgydealnz@gmail.com" className="font-bold text-ink-600 underline underline-offset-2">
            dodgydealnz@gmail.com
          </a>
          . We will review the issue and try to resolve it fairly.
        </p>
        <p className="mt-3">
          If your concern relates to privacy, use the contact process in our Privacy policy. You may also contact the
          relevant New Zealand regulator or use any other legal avenue available to you.
        </p>
      </TermsSection>

      <TermsSection title="16. Changes to these terms">
        <p>
          We may update these terms when the app, our business, or our legal obligations change. We will update the date
          at the top of this page. If a change is material, we will provide a prominent notice in the app or by email
          where appropriate. Continuing to use Dodgy Deal after an updated version takes effect means you accept the
          updated terms, except where the law requires a different process.
        </p>
      </TermsSection>

      <TermsSection title="17. New Zealand law">
        <p>
          These terms are governed by New Zealand law. Subject to any mandatory consumer rights and dispute-resolution
          process, the New Zealand courts have jurisdiction over disputes relating to Dodgy Deal.
        </p>
      </TermsSection>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-black text-stone-900">Related information</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm font-bold">
          <Link href="/settings" className="text-ink-600 underline underline-offset-2">
            Back to settings
          </Link>
          <Link href="/privacy" className="text-ink-600 underline underline-offset-2">
            Read our Privacy policy
          </Link>
        </div>
      </section>
    </main>
  );
}

function TermsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-display text-base font-black text-stone-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-stone-600">{children}</div>
    </section>
  );
}

function BulletList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="font-black text-stone-700">{label}</dt>
      <dd className="sm:text-right">{value}</dd>
    </div>
  );
}

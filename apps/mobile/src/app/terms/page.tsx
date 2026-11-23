"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { usePageHeader } from "@/lib/header-context";

/** Public-facing terms of use for the Dodgy Deal app and related services. */
export default function TermsPage() {
  const router = useRouter();
  usePageHeader("Terms of use", () => router.back());

  return (
    <main className="flex flex-col gap-4 px-5 py-5 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="dd-type-meta text-stone-500">Last updated: 23 November 2026</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold leading-7 text-stone-900">Terms of use</h1>
        <p className="mt-3 text-base leading-7 text-stone-600">
          These Terms of Use explain the rules that apply when you use the Dodgy Deal app and related services. By
          using Dodgy Deal, you agree to these terms. If you do not agree, please do not use the app.
        </p>
      </section>

      <TermsSection title="1. Who we are">
        <p>
          Dodgy Deal is an independent service for New Zealand shoppers. These terms apply to the app and related
          services offered under the Dodgy Deal name. In these terms, “we”, “us”, and “our” mean Dodgy Deal.
        </p>
        <dl className="mt-3 space-y-3 rounded-xl bg-stone-50 p-4 text-[15px] leading-6 text-stone-600">
          <ContactRow label="Service" value="Dodgy Deal, New Zealand" />
          <ContactRow
            label="Contact"
            value={
              <a href="mailto:dodgydealnz@gmail.com" className="underline underline-offset-2">
                dodgydealnz@gmail.com
              </a>
            }
          />
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
        <p className="mt-3">
          We are not affiliated with, endorsed by, or sponsored by the retailers shown in the app.
        </p>
      </TermsSection>

      <TermsSection title="3. Prices, promotions, and deal ratings">
        <p>
          We work to present useful and accurate information, but retailer prices, stock, product descriptions, store
          availability, and promotion dates can change. Information may be delayed, incomplete, unavailable, or
          different between stores or at checkout.
        </p>
        <p className="mt-3">
          Deal ratings estimate how the current price compares with the price history we have. They are for general
          information, not a promise that something is the cheapest option or a recommendation to buy. Check the
          retailer&rsquo;s current price, promotion conditions, unit size, stock, and checkout total before purchasing.
        </p>
        <p className="mt-3">
          We take reasonable care with claims shown in the app and will investigate reports of incorrect information.
          Please contact us if you find a price, promotion, image, or product detail that needs correction.
        </p>
      </TermsSection>

      <TermsSection title="4. Eligibility and accounts">
        <p>
          You must be at least 13 years old to create an account. If you are under 18, ask a parent or guardian before
          using account or paid features.
        </p>
        <p className="mt-3">
          Provide accurate details, keep your sign-in methods secure, and tell us promptly if you believe your account
          has been accessed without permission. Do not use another person&rsquo;s account without their permission.
        </p>
        <p className="mt-3">
          You can browse public deal information without an account. An account is needed for features such as saving
          lists and retaining your deal-check history.
        </p>
      </TermsSection>

      <TermsSection title="5. Acceptable use and your content">
        <p>You must use Dodgy Deal lawfully and respectfully. You must not:</p>
        <BulletList>
          <li>break any law or infringe another person&rsquo;s rights;</li>
          <li>interfere with, overload, probe, or bypass security controls on the app or its services;</li>
          <li>use bots, scraping, automated requests, or other methods to copy or harvest the service without our written permission;</li>
          <li>send malicious code or spam, or post content that is unlawful, abusive, threatening, or misleading; or</li>
          <li>use Dodgy Deal to build or train a competing price database without our permission.</li>
        </BulletList>
        <p className="mt-3">
          You are responsible for content you submit, including community price notes, profile details, feedback, and
          reports. You confirm you have the right to submit it. You give us permission to host, display, and adapt it
          as reasonably needed to operate, moderate, and improve Dodgy Deal.
        </p>
        <p className="mt-3">
          Do not post another person&rsquo;s private information or anything unlawful. Other users may see community
          notes and profile details you choose to publish. We may edit or remove content that breaches these terms or
          creates a legal, security, or safety risk.
        </p>
      </TermsSection>

      <TermsSection title="6. Intellectual property and third-party services">
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
        <p className="mt-3">
          Dodgy Deal may link to retailer websites or rely on third-party services to provide hosting, authentication,
          data, or other functionality. Those services are controlled by their own operators and terms. We do not
          control their content, availability, security, pricing, or practices. This does not limit any responsibility
          or consumer rights that cannot legally be excluded.
        </p>
        <p className="mt-3">
          A link or reference does not mean that Dodgy Deal endorses a retailer, product, service, or claim. Review the
          relevant third party&rsquo;s terms and privacy information before using its service.
        </p>
      </TermsSection>

      <TermsSection title="7. Availability and changes">
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
        <p className="mt-3">
          We may update these terms when the app, our service, or our legal obligations change. We will update the date
          at the top of this page. If a change is material, we will provide a prominent notice in the app or by email
          where appropriate. Continuing to use Dodgy Deal after an update takes effect means you accept the new terms,
          except where the law requires a different process.
        </p>
      </TermsSection>

      <TermsSection title="8. Fees and purchases">
        <p>
          Dodgy Deal Plus is an optional auto-renewing subscription available through Apple in the iOS app. The plan,
          price, billing period, and any introductory offer are shown before you confirm a purchase. Apple processes
          the payment; Dodgy Deal does not process purchases for retailer products.
        </p>
        <p className="mt-3">
          Apple renews the plan you choose automatically unless you cancel it in your Apple Account subscription
          settings. Any free trial or introductory offer and what you will be charged after it ends are shown before
          you confirm. If you cancel, access usually continues until the end of the current billing period. Deleting
          your Dodgy Deal account does not cancel the subscription. Apple handles billing and refund requests under its
          applicable terms and policies. Your rights under New Zealand law still apply.
        </p>
      </TermsSection>

      <TermsSection title="9. Consumer rights">
        <p>
          Nothing in these terms removes, restricts, or replaces a right or remedy that cannot lawfully be excluded.
          This includes rights under the New Zealand Fair Trading Act 1986 and, where it applies, the Consumer
          Guarantees Act 1993.
        </p>
        <p className="mt-3">
          The Fair Trading Act 1986 applies to our claims about Dodgy Deal, and the Consumer Guarantees Act 1993 may
          apply to services we provide. If you think something has gone wrong, contact us so we can investigate and
          try to put it right.
        </p>
      </TermsSection>

      <TermsSection title="10. Liability">
        <p>
          Retailers control their prices, promotions, stock, products, websites, and sales. We are not responsible for
          a retailer&rsquo;s actions or a purchase you make from them. Our price information can be delayed or
          incomplete, so check with the retailer before buying.
        </p>
        <p className="mt-3">
          We are not responsible for loss caused by your unlawful or unauthorised use of the app, or events outside our
          reasonable control.
        </p>
        <p className="mt-3">
          Nothing in these terms excludes, restricts, or modifies any consumer right, guarantee, or remedy that cannot
          legally be excluded under New Zealand law.
        </p>
      </TermsSection>

      <TermsSection title="11. Privacy, account deletion, and suspension">
        <p>
          You can stop using Dodgy Deal at any time. Our{" "}
          <Link href="/privacy" className="font-bold text-ink-600 underline underline-offset-2">
            Privacy policy
          </Link>
          {" "}explains how we handle personal information and request account deletion.
        </p>
        <p className="mt-3">
          We may suspend or end access if reasonably necessary to protect the app, users, providers, or our legal
          rights, or if you materially breach these terms. We will act proportionately where practical and will not use
          suspension or termination to remove rights that cannot be excluded.
        </p>
      </TermsSection>

      <TermsSection title="12. Contact and New Zealand law">
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
        <p className="mt-3">
          These terms are governed by New Zealand law. Subject to any mandatory consumer rights and dispute-resolution
          process, the New Zealand courts have jurisdiction over disputes relating to Dodgy Deal.
        </p>
      </TermsSection>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="dd-type-section text-stone-900">Related information</h2>
        <div className="mt-3 flex flex-col gap-3 text-[15px] font-semibold leading-6">
          <Link href="/settings" className="text-ink-600 underline underline-offset-2">
            Back to settings
          </Link>
          <Link href="/privacy" className="text-ink-600 underline underline-offset-2">
            Read our Privacy policy
          </Link>
          <a
            href="https://www.consumerprotection.govt.nz/general-help/consumer-laws/consumer-guarantees-act"
            target="_blank"
            rel="noreferrer"
            className="text-ink-600 underline underline-offset-2"
          >
            New Zealand consumer rights
          </a>
        </div>
      </section>
    </main>
  );
}

function TermsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="dd-type-section text-stone-900">{title}</h2>
      <div className="settings-document-copy mt-3 text-stone-600">{children}</div>
    </section>
  );
}

function BulletList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

function ContactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="font-semibold text-stone-700">{label}</dt>
      <dd className="sm:text-right">{value}</dd>
    </div>
  );
}

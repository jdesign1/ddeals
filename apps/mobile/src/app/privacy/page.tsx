"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { usePageHeader } from "@/lib/header-context";

/**
 * Public-facing Privacy Act 2020 privacy statement for the app.
 *
 * This is intentionally written as a draft in the product rather than as a
 * legal disclaimer hidden in code. The operator, postal address, privacy
 * email, and confirmed provider locations must be completed before release.
 * The content is based on the NZ Privacy Commissioner’s guidance for direct
 * and indirect collection, access/correction, retention, security, and
 * overseas disclosure.
 */
export default function PrivacyPage() {
  const router = useRouter();
  usePageHeader("Privacy policy", () => router.back());

  return (
    <main className="flex flex-col gap-5 px-5 py-6 pb-10">
      <section className="rounded-2xl border border-dodgy-200 bg-dodgy-50 p-5 shadow-sm">
        <p className="text-[11px] font-black tracking-widest text-dodgy-800">Please read</p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          This draft must be completed with the operator&rsquo;s legal name, address, privacy email, and confirmed
          service-provider details before Dodgy Deal is released publicly.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-stone-500">Last updated: 30 August 2026</p>
        <h1 className="mt-2 font-display text-xl font-black text-stone-900">Your privacy matters</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          This Privacy Policy explains how Dodgy Deal collects, uses, stores, and protects personal information when
          you use the Dodgy Deal app and related services. It is intended to be read alongside the Privacy Act 2020
          and the Information Privacy Principles (IPPs).
        </p>
      </section>

      <PolicySection title="1. Who we are">
        <p>
          Dodgy Deal is operated by <strong>[insert legal entity or individual name]</strong> (referred to as
          “Dodgy Deal”, “we”, “us”, or “our”).
        </p>
        <dl className="mt-3 space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
          <ContactRow label="Operator" value="[insert legal entity or individual name]" />
          <ContactRow label="Address" value="[insert physical or postal address]" />
          <ContactRow label="Privacy officer" value="[insert name or role]" />
          <ContactRow label="Privacy contact" value="[insert privacy email address]" />
        </dl>
        <p className="mt-3">
          Our Privacy Officer oversees privacy compliance, access and correction requests, privacy complaints, and
          contact with the Office of the Privacy Commissioner.
        </p>
      </PolicySection>

      <PolicySection title="2. What personal information we collect">
        <p>Depending on how you use Dodgy Deal, we may collect:</p>
        <BulletList>
          <li>
            <strong>Account information:</strong> your email address, password credentials handled by our
            authentication provider, name, date of birth, and NZ postcode.
          </li>
          <li>
            <strong>Shopping activity:</strong> saved lists, saved list items, products you check, and your deal-check
            history.
          </li>
          <li>
            <strong>Support information:</strong> information you choose to send us, such as a support request or a
            report about an incorrect deal.
          </li>
          <li>
            <strong>Technical information:</strong> account/session identifiers, security information, and technical
            logs such as IP address, device, browser, and error information where these are collected by the app,
            hosting provider, or database provider.
          </li>
          <li>
            <strong>Local app information:</strong> your card-layout preference and locally cached catalogue data.
            These are stored on your device to make the app work smoothly and are not, by themselves, a user profile.
          </li>
        </BulletList>
        <p className="mt-3">
          You can browse public deal information without creating an account. An account is needed for features such
          as saving lists and retaining your deal-check history. At present, we do not intentionally collect precise
          location, contacts, payment information, advertising identifiers, or biometric information. If that changes,
          we will update this policy and provide any required permission or collection notice before collecting it.
        </p>
      </PolicySection>

      <PolicySection title="3. How and why we collect and use information">
        <p>We collect information directly from you when you:</p>
        <BulletList>
          <li>create or use an account;</li>
          <li>save a list, check a deal, or use another account feature;</li>
          <li>contact us or submit a report; or</li>
          <li>use the app, which may generate technical and security information.</li>
        </BulletList>
        <p className="mt-3">We use personal information to:</p>
        <BulletList>
          <li>create, authenticate, secure, and maintain your account;</li>
          <li>save and display your lists and deal-check history;</li>
          <li>provide, troubleshoot, maintain, and improve Dodgy Deal;</li>
          <li>respond to support requests and investigate reported errors or misuse;</li>
          <li>protect the app, users, and our providers from fraud, abuse, and security incidents; and</li>
          <li>comply with legal obligations or respond to lawful requests.</li>
        </BulletList>
        <p className="mt-3">
          We will not use your personal information for a new purpose that is incompatible with the purpose described
          here without first providing an appropriate notice or obtaining permission where required. We take reasonable
          steps to keep personal information accurate, complete, up to date, and not misleading before using it.
        </p>
      </PolicySection>

      <PolicySection title="4. Information requested during sign-up">
        <p>
          Email and password are needed to create and secure an account. The sign-up form also currently requests your
          name, date of birth, and NZ postcode. These fields are stored with your account details. They are not
          currently used to create personalised deal recommendations.
        </p>
        <p className="mt-3">
          We will only retain and use this information for a clear, lawful purpose. If a field is not needed for the
          account feature you want to use, you can continue using Dodgy Deal without an account instead.
        </p>
      </PolicySection>

      <PolicySection title="5. Deal and retailer information">
        <p>
          Dodgy Deal displays product, retailer, store, image, price, and promotion information from public or
          retailer-related sources. This catalogue information is generally about products and prices rather than
          identifiable people, so it is not normally your personal information.
        </p>
        <p className="mt-3">
          We do not use retailer information to create a personal profile about you. If we ever receive personal
          information about an identifiable person from another organisation, we will provide any notice required by
          the Privacy Act 2020, including the source, purpose, intended recipients, and access/correction rights where
          the indirect-collection rules apply.
        </p>
      </PolicySection>

      <PolicySection title="6. Who we share information with">
        <p>We may disclose personal information only when reasonably necessary for the purposes in this policy, including to:</p>
        <BulletList>
          <li>
            service providers that host our database, authentication, app, website, email, or technical systems. At
            present, Supabase provides our database and authentication services;
          </li>
          <li>people or providers who help us respond to support, security, or legal issues;</li>
          <li>
            law enforcement, regulators, courts, or other parties where disclosure is required or authorised by law;
            and
          </li>
          <li>a successor or professional adviser if Dodgy Deal is reorganised, sold, or transferred.</li>
        </BulletList>
        <p className="mt-3">
          We do not sell or rent your personal information. We require service providers to handle information only as
          necessary for the services they provide and to protect it appropriately.
        </p>
      </PolicySection>

      <PolicySection title="7. Storage, security, and overseas processing">
        <p>
          Personal information is stored using access-controlled systems and reasonable safeguards designed to prevent
          loss, misuse, unauthorised access, disclosure, alteration, or destruction. No internet service is completely
          secure, so we cannot promise absolute security.
        </p>
        <p className="mt-3">
          Our database, authentication, hosting, and other technology providers may store or process information
          outside New Zealand. Before release, we will name the providers used in production and confirm the countries
          or safeguards that apply. We will only make an overseas disclosure in accordance with Information Privacy
          Principle 12, including by using comparable protections, appropriate contractual safeguards, or informed
          authorisation where required.
        </p>
      </PolicySection>

      <PolicySection title="8. How long we keep information">
        <p>
          We keep personal information only for as long as it is needed for the purpose for which it was collected, to
          provide the service, resolve disputes, maintain security, or meet a legal obligation. We periodically review
          stored information and securely delete or de-identify it when it is no longer needed.
        </p>
        <p className="mt-3">
          When you delete your account, we will delete or de-identify your account information and associated lists and
          deal-check history, subject to information we are legally required or reasonably permitted to retain. Local
          app data may remain on your device until you clear the app or its storage.
        </p>
      </PolicySection>

      <PolicySection title="9. Your privacy rights">
        <p>
          Under the Privacy Act 2020, you can ask us for the personal information we hold about you and ask us to
          correct information that is wrong, incomplete, or misleading. You can also ask questions or complain about how
          we handle your information.
        </p>
        <p className="mt-3">
          Email your request to <strong>[insert privacy email address]</strong>. Please tell us what you are requesting
          and provide enough information for us to confirm your identity and locate the relevant records. We will
          respond within the timeframe required by the Privacy Act; access requests ordinarily need a response within
          20 working days, subject to lawful extensions or withholding grounds.
        </p>
        <p className="mt-3">
          You can delete your Dodgy Deal account from the in-app account settings when that function is available. If
          you cannot access the app, contact the Privacy Officer using the details above and request account deletion.
        </p>
      </PolicySection>

      <PolicySection title="10. Privacy incidents and complaints">
        <p>
          If we become aware of a privacy breach, we will assess the risk of serious harm, contain and remediate the
          incident, keep appropriate records, and notify the Privacy Commissioner and affected people when notification
          is required by the Privacy Act 2020.
        </p>
        <p className="mt-3">
          Please contact our Privacy Officer first so we can investigate and try to resolve your concern. If you are not
          satisfied with our response, you can contact the Office of the Privacy Commissioner at{" "}
          <a
            href="https://www.privacy.org.nz/"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-ink-600 underline underline-offset-2"
          >
            privacy.org.nz
          </a>
          .
        </p>
      </PolicySection>

      <PolicySection title="11. Changes to this policy">
        <p>
          We may update this policy when our services, data practices, providers, or legal obligations change. We will
          update the date at the top of this page and, where a change is material, provide a prominent notice in the app
          or by email where appropriate.
        </p>
      </PolicySection>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-display text-base font-black text-stone-900">Related information</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm font-bold">
          <Link href="/settings" className="text-ink-600 underline underline-offset-2">
            Back to settings
          </Link>
          <a
            href="https://www.privacy.org.nz/privacy-principles/"
            target="_blank"
            rel="noreferrer"
            className="text-ink-600 underline underline-offset-2"
          >
            Read the New Zealand Privacy Commissioner&rsquo;s privacy principles
          </a>
        </div>
      </section>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
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

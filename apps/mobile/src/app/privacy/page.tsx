"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { usePageHeader } from "@/lib/header-context";

/** Public-facing privacy policy for the Dodgy Deal app and related services. */
export default function PrivacyPage() {
  const router = useRouter();
  usePageHeader("Privacy policy", () => router.back());

  return (
    <main className="flex flex-col gap-4 px-5 py-5 pb-10">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="dd-type-meta text-stone-500">Last updated: 23 November 2026</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold leading-7 text-stone-900">Your privacy matters</h1>
        <p className="mt-3 text-base leading-7 text-stone-600">
          This policy explains how Dodgy Deal handles personal information under the New Zealand Privacy Act 2020
          when you use our app and related services.
        </p>
      </section>

      <PolicySection title="1. Who we are">
        <p>
          Dodgy Deal is an independent service for New Zealand shoppers. In this policy, “we”, “us”, and “our” refer
          to the Dodgy Deal app and service.
        </p>
        <dl className="mt-3 space-y-3 rounded-xl bg-stone-50 p-4 text-[15px] leading-6 text-stone-600">
          <ContactRow label="Service" value="Dodgy Deal, New Zealand" />
          <ContactRow
            label="Privacy contact"
            value={
              <a href="mailto:dodgydealnz@gmail.com" className="underline underline-offset-2">
                dodgydealnz@gmail.com
              </a>
            }
          />
        </dl>
        <p className="mt-3">
          Our privacy contact handles access and correction requests, privacy complaints, and contact with the Office
          of the Privacy Commissioner.
        </p>
      </PolicySection>

      <PolicySection title="2. What personal information we collect">
        <p>Depending on how you use Dodgy Deal, we may collect:</p>
        <BulletList>
          <li>
            <strong>Account information:</strong> your email address, account and sign-in identifiers, name, date of
            birth, and, if you choose to provide it, your NZ postcode. If you have Plus, we may also receive Apple
            transaction details to confirm your subscription. We do not receive or store your email password.
          </li>
          <li>
            <strong>App activity:</strong> saved lists and items, products you check, deal-check history, chosen deal
            categories, and settings such as notification preferences.
          </li>
          <li>
            <strong>Information you submit:</strong> support requests and price reports (which may include your name,
            reply email, product, retailer, store, displayed price, and message), community price notes, helpful votes,
            reports, and profile details you choose to share, such as your display name, city, favourite branch, or
            profile quote. Published notes and selected profile details may be visible to other app users.
          </li>
          <li>
            <strong>Technical information:</strong> security and session identifiers, push-notification token (if you
            enable notifications), notification settings, and service logs such as IP address, device, browser, access
            times, and error information collected by our hosting, database, or authentication providers.
          </li>
          <li>
            <strong>Local app information:</strong> app preferences and cached catalogue data stored on your device.
          </li>
        </BulletList>
        <p className="mt-3">
          Apple handles payment card and billing details for Plus. We do not collect precise location, contacts,
          advertising identifiers, or biometric information.
        </p>
      </PolicySection>

      <PolicySection title="3. How and why we collect and use information">
        <p>We collect information when you:</p>
        <BulletList>
          <li>create or use an account;</li>
          <li>save a list, check a deal, or use another account feature;</li>
          <li>contact us or submit a report;</li>
          <li>choose Apple or Google sign-in; or</li>
          <li>use the app, which may generate technical and security information.</li>
        </BulletList>
        <p className="mt-3">We use personal information to:</p>
        <BulletList>
          <li>create, authenticate, secure, and maintain your account and check your age eligibility;</li>
          <li>save and display your lists and deal-check history;</li>
          <li>provide, troubleshoot, maintain, and improve Dodgy Deal;</li>
          <li>respond to support requests and investigate price reports, community reports, or misuse;</li>
          <li>
            show community notes and profile details you choose to share, and run Deal Detective features. If you have
            a published community note, your display name, city, and Deal Detective streak may appear on the streak
            leaderboard;
          </li>
          <li>send account-related push notifications if you enable them;</li>
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
          An email address is needed to create and secure an account. We ask for your name and date of birth to set up
          your profile and confirm you are at least 13. You can optionally provide your NZ postcode to help us
          understand broad usage across New Zealand and improve the app. We do not use your date of birth or postcode
          to set product prices or make personalised deal recommendations. Your postcode is not shown to other users.
        </p>
        <p className="mt-3">
          We will only retain and use this information for a clear, lawful purpose. Leaving the postcode field blank
          will not prevent you from creating an account or using account features.
        </p>
      </PolicySection>

      <PolicySection title="5. Deal data and sign-in sources">
        <p>
          Dodgy Deal collects product, retailer, store, image, price, and promotion information from retailer-related
          sources. This catalogue information is about products and prices, not individual shoppers, and is not
          normally personal information.
        </p>
        <p className="mt-3">
          We do not use retailer catalogue information to build a personal profile about you. When you use Apple or
          Google sign-in, we receive your provider account identifier and any profile details the provider shares,
          such as your name or email address. We use these details to set up or authenticate your account. Account
          information is held in our database hosted by Supabase, and may be handled by the providers listed below.
          You can ask us to access or correct it using the contact details in this policy.
        </p>
      </PolicySection>

      <PolicySection title="6. Who we share information with">
        <p>We may disclose personal information only when reasonably necessary for the purposes in this policy, including to:</p>
        <BulletList>
          <li>
            service providers that run parts of the service: Supabase for account authentication and databases, Vercel
            for app hosting, Resend for support email delivery, Apple or Google for sign-in, and Apple Push
            Notification service for notifications;
          </li>
          <li>people or providers who help us respond to support, security, or legal issues;</li>
          <li>
            law enforcement, regulators, courts, or other parties where disclosure is required or authorised by law;
          </li>
          <li>a successor or professional adviser if Dodgy Deal is reorganised, sold, or transferred.</li>
        </BulletList>
        <p className="mt-3">
          We do not sell your personal information or use it for third-party advertising. Some providers may store or
          process information outside New Zealand. See the next section for how we protect it.
        </p>
      </PolicySection>

      <PolicySection title="7. Storage, security, and overseas processing">
        <p>
          We use access controls and other reasonable safeguards to protect personal information from loss, misuse,
          unauthorised access, or disclosure. No internet service is completely secure.
        </p>
        <p className="mt-3">
          We take reasonable steps to protect information handled by our service providers. If we disclose personal
          information to an overseas organisation for its own use, we will follow Information Privacy Principle 12,
          including checking for comparable safeguards or getting your informed authorisation where required.
        </p>
      </PolicySection>

      <PolicySection title="8. How long we keep information">
        <p>
          We keep personal information only while it is needed to provide the service, handle support or disputes,
          protect security, or meet a legal obligation. We then delete or de-identify it when reasonably practical.
        </p>
        <p className="mt-3">
          You can delete your account in Settings. We delete your profile, saved lists, and browsing history. If you
          have published a community price note, we may keep its product, price, store, and date without your name or
          free-text so the useful price sighting remains. Other information may be retained where the law allows or
          requires it.
          Some data may remain in secure backups until they are routinely replaced. Deleting your Dodgy Deal account
          does not cancel an Apple subscription; cancel it separately in your Apple Account settings. Local app data
          may remain on your device until you clear the app or its storage.
        </p>
      </PolicySection>

      <PolicySection title="9. Your privacy rights">
        <p>
          Under the Privacy Act 2020, you can ask us for the personal information we hold about you and ask us to
          correct information that is wrong, incomplete, or misleading. You can also ask questions or complain about how
          we handle your information.
        </p>
        <p className="mt-3">
          Email your request to{" "}
          <a href="mailto:dodgydealnz@gmail.com" className="font-bold underline underline-offset-2">
            dodgydealnz@gmail.com
          </a>
          . Please tell us what you are requesting and provide enough information for us to confirm your identity and
          locate the relevant records. We will respond within the timeframe required by the Privacy Act; access
          requests ordinarily need a response within 20 working days, subject to lawful extensions or withholding
          grounds.
        </p>
        <p className="mt-3">If you cannot access the app, email us above to request account deletion.</p>
      </PolicySection>

      <PolicySection title="10. Privacy incidents and complaints">
        <p>
          If we become aware of a privacy breach, we will assess the risk of serious harm, contain and remediate the
          incident, keep appropriate records, and notify the Privacy Commissioner and affected people when notification
          is required by the Privacy Act 2020.
        </p>
        <p className="mt-3">
          Please contact us first so we can investigate and try to resolve your concern. If you are not
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

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="dd-type-section text-stone-900">Related information</h2>
        <div className="mt-3 flex flex-col gap-3 text-[15px] font-semibold leading-6">
          <Link href="/settings" className="text-ink-600 underline underline-offset-2">
            Back to settings
          </Link>
          <a
            href="https://www.privacy.org.nz/privacy-principles/"
            target="_blank"
            rel="noreferrer"
            className="text-ink-600 underline underline-offset-2"
          >
            New Zealand Privacy Commissioner&rsquo;s privacy principles
          </a>
        </div>
      </section>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
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

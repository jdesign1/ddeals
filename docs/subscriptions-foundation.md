# Subscription foundation and current product plan

This document records the subscription foundation and the current first-release
product decision. The commercial details are maintained in
`docs/subscription-product-plan.md`.

The core deal assessment remains free. The paid plan is for extended history,
ongoing monitoring, and convenience features.

## Current app contract

The shared package now exposes:

- `EntitlementKey`: an open string key, so future capabilities can be added
  without changing a free/subscriber boolean.
- `EntitlementStatus`: `active`, `grace_period`, `billing_retry`, `expired`,
  or `revoked`.
- `isEntitlementUsable(...)`: checks status and verified expiry.
- `hasEntitlement(...)`: checks whether a capability is currently available.
- `fetchUserEntitlements(...)`: reads the signed-in user's rows from Accounts
  Supabase; RLS remains the authority for account ownership.
- `FREE_WATCHLIST_LIMIT`: five saved products for free accounts.
- `FREE_CHECK_HISTORY_LIMIT`: an internal recent-history fetch ceiling used to
  build the free All Checks preview; the user-facing free experience shows two
  readable entries.
- `FREE_DEAL_STATS_CHECK_LIMIT`: an internal recent-check ceiling retained for
  server-side stats requests; the personalised Watchlist stats view is
  subscription-only, with NZ Trends remaining free.
- `PREMIUM_CHECK_HISTORY_LIMIT`: the server-side extended-history ceiling.

Example future keys are `advanced_history`, `deal_alerts`, and
`unlimited_lists`. They are examples only and do not currently unlock or limit
anything.

## Accounts database

The reviewed SQL migration is:

`supabase/accounts-migrations/20260926000000_subscription_foundation.sql`

It has been applied to the dedicated Accounts Supabase project, not the
catalogue/data project. The tables are protected as follows:

- signed-in users can select only their own entitlement rows;
- browser clients cannot insert, update, revoke, or delete entitlements;
- the subscription event log is server-only;
- duplicate provider events are rejected by a provider/event-id constraint;
- service-role writes remain outside the browser bundle.

The Accounts project review completed successfully: Health reported 0 errors,
Performance reported 0 errors and 0 warnings, and Security reported 0 errors.
The remaining Security warnings are pre-existing function/password-protection
recommendations outside this subscription foundation.

The live Accounts project also revokes browser `SELECT` access to
`public.deal_checks`. Authenticated clients retain only the insert privilege
needed when a deal is checked. History reads now go through the authenticated
server route, which checks the verified `premium_access` entitlement before
applying the free or premium limit.

## Phase 2 implementation

The first Apple plumbing is now in place for the agreed product direction:

- The iOS shell exposes a small StoreKit 2 bridge for loading products,
  purchasing with a Supabase account UUID as Apple's `appAccountToken`,
  checking current entitlements, and restoring purchases.
- `/api/subscriptions/apple/verify` verifies a StoreKit transaction JWS on the
  server, requires the Apple account token to match the signed-in Dodgy Deal
  account, and upserts only server-mapped entitlement keys.
- `/api/subscriptions/apple/notifications` verifies App Store Server
  Notifications V2 and applies renewals, billing retry, grace period, expiry,
  refunds, and revocations.
- Grace-period notifications verify Apple's signed renewal information and use
  `gracePeriodExpiresDate` as the effective access expiry, rather than ending
  access at the normal transaction period boundary.
- The entitlement upsert also preserves an unexpired grace-period state when a
  later device transaction arrives without renewal information, so device
  reconciliation cannot prematurely remove valid access.
- Apple signed timestamps prevent an older notification from overwriting a
  newer transaction state.
- The app uses the proposed monthly product `nz.dodgydeals.plus.monthly` and
  annual product `nz.dodgydeals.plus.annual`, both mapped to
  `premium_access`.
- The agreed prices are NZ$2 monthly and NZ$20 annually, with a one-month free
  introductory offer configured in App Store Connect before launch.
- The full assessment, evidence, supermarket comparison, and 90-day graph
  remain free. Premium history, unlimited Watchlist, and price alerts are
  separate from that core assessment.

Before enabling a product, configure the server-only Apple environment,
bundle/app identifiers, App Store root certificates, and product-to-entitlement
map. Product IDs can be exposed to the iOS client, but Apple private keys and
root certificate material must never use `NEXT_PUBLIC_` variables.

The endpoints intentionally return configuration-unavailable responses until
those values are present. The remaining launch work is App Store Connect and
Vercel configuration, followed by Sandbox/TestFlight purchase, restore,
renewal, expiry, and downgrade testing.

## Subscription safety and operations

The paid flow includes the following safeguards:

- The push notification worker re-checks the current `premium_access`
  entitlement immediately before delivery. A saved push preference alone is
  never sufficient to send a paid price alert. A short-lived database claim
  also prevents overlapping notification runs from sending the same event
  twice.
- If an Apple purchase is linked to another Dodgy Deal account, the app tells
  the shopper to sign in with the original account and provides a support
  recovery path. Accounts are not automatically merged without verifying
  ownership.
- Account deletion warns that Apple subscriptions are managed separately and
  must be cancelled in Apple to prevent future charges. Apple notifications
  for an account that has since been deleted are recorded and acknowledged
  without recreating the account or retrying indefinitely.
- `/api/subscriptions/apple/reconcile` runs daily after the notification
  worker. It marks entitlements whose verified expiry has passed as expired,
  records recent Apple notification health, and writes a server-only
  reconciliation event for monitoring. This is stale-state cleanup and health
  monitoring; the next production-hardening step is using Apple's App Store
  Server API and notification history to repair missed webhook state.

## Deployment configuration status

The `dodgy-deal-mobile` Vercel project now has the non-secret Sandbox values
configured for production and preview:

- `NEXT_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_IDS`
- `APPLE_STORE_ENVIRONMENT=Sandbox`
- `APPLE_BUNDLE_ID=nz.dodgydeals.app`
- `APPLE_ENTITLEMENT_PRODUCT_MAP`

The Apple G3 root certificate is now configured as encrypted server-only
Vercel environment configuration for production and preview. The remaining
launch checks are:

- confirm the Accounts service-role key is populated and usable by the
  subscription routes
- add `APPLE_APPLE_ID` before switching the server to Production
- optionally add the Apple G2 root certificate alongside G3 if Apple’s
  verification chain requires it in future

After the products exist in App Store Connect, configure App Store Server
Notifications V2 to send to:

`https://app.dodgydeal.co.nz/api/subscriptions/apple/notifications`

Keep the environment in Sandbox until TestFlight purchase, restore, renewal,
expiry, refund, and notification delivery have all been verified.

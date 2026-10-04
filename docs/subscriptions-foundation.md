# Subscription foundation

This is the Phase 1 foundation for paid subscriptions. It deliberately does
not add a paywall, limits, prices, trial length, or StoreKit purchase flow.
Existing free functionality remains unchanged.

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

## Phase 2 implementation

The first Apple plumbing is now in place without choosing prices or limits:

- The iOS shell exposes a small StoreKit 2 bridge for loading products,
  purchasing with a Supabase account UUID as Apple's `appAccountToken`,
  checking current entitlements, and restoring purchases.
- `/api/subscriptions/apple/verify` verifies a StoreKit transaction JWS on the
  server, requires the Apple account token to match the signed-in Dodgy Deal
  account, and upserts only server-mapped entitlement keys.
- `/api/subscriptions/apple/notifications` verifies App Store Server
  Notifications V2 and applies renewals, billing retry, grace period, expiry,
  refunds, and revocations.
- Apple signed timestamps prevent an older notification from overwriting a
  newer transaction state.

Before enabling a product, configure the server-only Apple environment,
bundle/app identifiers, App Store root certificates, and product-to-entitlement
map. Product IDs can be exposed to the iOS client, but Apple private keys and
root certificate material must never use `NEXT_PUBLIC_` variables.

The endpoints intentionally return configuration-unavailable responses until
those values are present. No current free functionality is gated.

Only after the StoreKit flow is tested in Xcode and App Store sandbox should we
decide product IDs, prices, trials, and feature limits.

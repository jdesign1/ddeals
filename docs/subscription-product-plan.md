# Subscription product plan

This document records the current commercial direction for the Dodgy Deal
subscription. It is a product reference only; App Store Connect products,
entitlement keys, prices, and payment configuration should be finalised from
this plan before launch.

## Pricing

- Monthly: **NZ$2 per month**
- Annual: **NZ$20 paid upfront**
- Introductory offer: **one month free**, followed by the selected plan price

Proposed App Store Connect product identifiers:

- Monthly: `nz.dodgydeals.plus.monthly`
- Annual: `nz.dodgydeals.plus.annual`
- Entitlement: `premium_access`

The annual price gives users a modest saving compared with twelve monthly
payments, while keeping the cost low for people managing a cost-of-living
crisis.

## Free access

Free users should continue to receive meaningful cost-saving help:

- Browse and search all specials
- View the complete deal assessment page
- See the full deal verdict and evidence explaining it
- Compare current prices across supermarkets
- See the current normal-price comparison
- See the full price history and 90-day graph
- See the buy-now, wait, or watch guidance
- Keep **5 recently saved products unlocked** in the Watchlist
- Keep any additional saved products safely stored as locked items until subscribing
- See current price and deal status for saved products
- Open Deal Stats and see a preview of the personalised Watchlist insights, with the full view reserved for subscribers
- Review the **2 most recent All Checks** entries in full; older entries appear as a locked preview
- View the free **NZ Trends** section of Deal Stats
- No automatic price-drop alerts

### Final free limits

These are the user-facing limits for a free signed-in account. They are
deliberately based on what the user can read and use in the app, rather than
on internal API fetch sizes.

| Area | Free experience | Paid experience |
| --- | --- | --- |
| Watchlist | Five most recently saved products are unlocked. Extra saved products remain stored but locked. | All saved products are unlocked. |
| All Checks | Two most recent checks are readable. Older checks show a locked preview and subscription prompt. | Full check history, search and date filters. |
| Deal Stats | Personalised Watchlist stats show a locked preview. NZ Trends remains available. | Full personalised Watchlist stats and insights. |

The free deal assessment remains complete, including the verdict, evidence,
supermarket comparison, 90-day graph and price-timing guidance. These limits
restrict convenience and personal history, not the core information needed to
make a single shopping decision.

## Paid access

Subscribers receive:

- Unlimited Watchlist items
- Price-drop alerts
- Alerts when a product becomes a genuinely good deal
- Proactive monitoring of saved products
- Custom alert preferences
- Weekly savings or deal summaries
- Unlimited lists
- Full Deal Stats, including supermarket rankings, price-change trends, and estimated savings
- Full All Checks history with search and date filters
- Future premium features as they are added

## Trial and downgrade behaviour

During the one-month trial, users receive the complete paid experience.

If the trial ends without a paid subscription:

- Existing Watchlist items and lists remain saved
- Automatic alerts stop
- The five most recently saved Watchlist items remain unlocked
- Additional saved items remain stored but locked; no user data is deleted
- Personalised Deal Stats returns to its locked preview, while NZ Trends remains free
- All Checks returns to the two-entry readable preview
- Free users may still save additional items, but those items remain locked until subscribing
- The app clearly explains what subscribing restores

The product should remain useful for people who cannot afford a subscription.
The paid plan primarily sells convenience: the app monitors prices and
notifies the user when action may be worthwhile.

## Setup guardrails

- Start with one paid subscription tier rather than multiple paid tiers.
- Keep current free browsing and basic deal assessment available.
- Never hide the deal assessment evidence or verdict behind the subscription.
- Keep the initial free limits intentionally modest and review them after
  observing whether the subscription provides enough value without blocking
  useful cost-saving information.
- Finalise App Store product identifiers and entitlement mappings from this
  plan before enabling purchases.

## App Store Connect setup checklist

The paid agreement and bank account are now accepted, so create the products
with these exact values before testing the purchase flow:

1. In App Store Connect, open the app and go to **Monetization →
   Subscriptions**.
2. Create one subscription group:
   - Reference name: `Dodgy Deal Plus`
   - Display name: `Dodgy Deal Plus`
3. Add the monthly auto-renewable subscription:
   - Reference name: `Dodgy Deal Plus Monthly`
   - Product ID: `nz.dodgydeals.plus.monthly`
   - Duration: 1 month
   - New Zealand starting price: NZ$2.00
4. Add the annual auto-renewable subscription to the same group:
   - Reference name: `Dodgy Deal Plus Annual`
   - Product ID: `nz.dodgydeals.plus.annual`
   - Duration: 1 year
   - New Zealand starting price: NZ$20.00
5. Add the same introductory offer to both products: **Free → 1 month**.
   Apple allows a customer to redeem only one introductory offer per
   subscription group, so the trial should not be described as two separate
   free months.
6. Add the New Zealand localization for each product:
   - Display name: `Dodgy Deal Plus`
   - Description: `Keep watching prices with unlimited Watchlist items and price alerts.`
7. Initially make the products available in New Zealand only. We can add other
   storefronts after the NZ purchase and support flow is proven.
8. Create a Sandbox Apple Account with the New Zealand storefront, then test
   the products in a development-signed or TestFlight build. TestFlight
   renewals are accelerated, so a monthly subscription can be tested without
   waiting a month.

Do not paste Apple private keys, certificates, or Supabase service keys into
the repository or chat. The current app reads product IDs from the public
configuration and keeps verification material server-side.

### Server notification setup

For TestFlight, set the App Store Server Notifications **Sandbox Server URL**
to:

`https://app.dodgydeal.co.nz/api/subscriptions/apple/notifications`

Choose **Version 2**. Keep the app’s server environment set to `Sandbox` while
testing. Before public release, configure a Production deployment with
`APPLE_STORE_ENVIRONMENT=Production`, the numeric Apple App ID, and the Apple
root certificates, then set the Production Server URL to the same endpoint.
If Sandbox and Production use separate deployments, point each Apple URL at
the matching environment deployment.

## Implementation status

The app foundation is now prepared for the first Apple subscription group:

- The app has one generic `premium_access` entitlement for both products.
- The Accounts project stores verified entitlements and an idempotent Apple
  event log with RLS protecting account reads.
- The iOS shell supports product loading, purchase, restore, and current
  entitlement reconciliation.
- The app keeps deal browsing and the complete assessment experience free.
- Watchlist access is capped at five saved products for free accounts, while
  proactive price alerts are reserved for subscribers.
- Free users receive a small readable All Checks preview and a locked preview
  of personalised Deal Stats; subscribers receive the full history and insight
  views.

Before TestFlight purchase testing, create the App Store Connect products and
configure the server-only Apple verification variables and App Store Server
Notifications V2 URL. Do not switch the production environment on until the
products, certificates, and notification endpoint have been verified in
Sandbox.

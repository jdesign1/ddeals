# Subscription product plan

This document records the current commercial direction for the Dodgy Deal
subscription. It is a product reference only; App Store Connect products,
entitlement keys, prices, and payment configuration should be finalised from
this plan before launch.

## Pricing

- Monthly: **NZ$2 per month**
- Annual: **NZ$24 paid upfront**
- Introductory offer: **one month free**, followed by the selected plan price

Proposed App Store Connect product identifiers:

- Monthly: `nz.dodgydeals.plus.monthly`
- Annual: `nz.dodgydeals.plus.annual`
- Entitlement: `premium_access`

The annual price is intentionally the same as twelve monthly payments. It
provides upfront payment and convenience, but is not presented as an annual
discount.

## Free access

Free users should continue to receive meaningful cost-saving help:

- Browse and search all specials
- View the complete deal assessment page
- See the full deal verdict and evidence explaining it
- Compare current prices across supermarkets
- See the current normal-price comparison
- See the full price history and 90-day graph
- See the buy-now, wait, or watch guidance
- Save up to **5 products** to the Watchlist
- See current price and deal status for saved products
- See a summary of Deal Stats based on the **30 most recent checks**
- Review the **10 most recent All Checks** entries
- No automatic price-drop alerts

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
- Saved items remain readable
- The user can keep up to five Watchlist items
- Deal Stats falls back to the 30-check summary
- All Checks falls back to the 10 most recent entries
- New items cannot be added while over the five-item free limit
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
- Free users receive a server-capped recent view of Deal Stats and All Checks;
  subscribers receive the extended history and insight views.

Before TestFlight purchase testing, create the App Store Connect products and
configure the server-only Apple verification variables and App Store Server
Notifications V2 URL. Do not switch the production environment on until the
products, certificates, and notification endpoint have been verified in
Sandbox.

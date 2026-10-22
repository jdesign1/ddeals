import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBSCRIPTION_ENTITLEMENT_KEYS,
  SUBSCRIPTION_PRODUCT_IDS,
  type SubscriptionEntitlementRecord,
} from "@dodgey-deals/shared";
import {
  chooseCurrentSubscription,
  formatSubscriptionDate,
  getSubscriptionPlanLabel,
  getSubscriptionRenewalLabel,
  getSubscriptionStatusLabel,
} from "./subscription-display.ts";

function entitlement(overrides: Partial<SubscriptionEntitlementRecord> = {}): SubscriptionEntitlementRecord {
  return {
    id: "entitlement-1",
    account_id: "account-1",
    entitlement_key: SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess,
    status: "active",
    provider: "apple_app_store",
    product_id: SUBSCRIPTION_PRODUCT_IDS.monthly,
    provider_transaction_id: "transaction-1",
    original_transaction_id: "original-1",
    provider_signed_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2026-11-01T00:00:00.000Z",
    verified_at: "2026-10-01T00:00:00.000Z",
    revoked_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

test("subscription display labels describe monthly and annual plans", () => {
  assert.equal(getSubscriptionPlanLabel(SUBSCRIPTION_PRODUCT_IDS.monthly), "Monthly plan");
  assert.equal(getSubscriptionPlanLabel(SUBSCRIPTION_PRODUCT_IDS.annual), "Annual plan");
  assert.equal(getSubscriptionRenewalLabel(SUBSCRIPTION_PRODUCT_IDS.monthly), "Renews monthly unless cancelled");
  assert.equal(getSubscriptionRenewalLabel(SUBSCRIPTION_PRODUCT_IDS.annual), "Renews annually unless cancelled");
});

test("subscription status labels explain billing recovery states", () => {
  assert.equal(getSubscriptionStatusLabel("active"), "Active");
  assert.equal(getSubscriptionStatusLabel("grace_period"), "Active — billing grace period");
  assert.equal(getSubscriptionStatusLabel("billing_retry"), "Active — billing being retried");
});

test("subscription dates are formatted for New Zealand users", () => {
  assert.equal(formatSubscriptionDate("2026-11-01T00:00:00.000Z"), "1 November 2026");
  assert.equal(formatSubscriptionDate(null), null);
  assert.equal(formatSubscriptionDate("not-a-date"), null);
});

test("current subscription prefers usable access and the furthest expiry", () => {
  const current = chooseCurrentSubscription([
    entitlement({ id: "expired", status: "expired", expires_at: "2026-12-01T00:00:00.000Z" }),
    entitlement({ id: "monthly-current", expires_at: "2026-11-01T00:00:00.000Z" }),
    entitlement({ id: "annual-current", product_id: SUBSCRIPTION_PRODUCT_IDS.annual, expires_at: "2027-10-01T00:00:00.000Z" }),
  ], SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess);

  assert.equal(current?.id, "annual-current");
});

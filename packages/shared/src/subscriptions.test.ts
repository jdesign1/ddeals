import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAMPLE_ENTITLEMENT_KEYS,
  hasEntitlement,
  isEntitlementUsable,
  type SubscriptionEntitlementRecord,
} from "./subscriptions.ts";

const NOW = new Date("2026-09-26T00:00:00.000Z");

function entitlement(
  overrides: Partial<SubscriptionEntitlementRecord> = {}
): SubscriptionEntitlementRecord {
  return {
    id: "entitlement-1",
    account_id: "account-1",
    entitlement_key: EXAMPLE_ENTITLEMENT_KEYS.advancedHistory,
    status: "active",
    provider: "apple_app_store",
    product_id: "com.dodgydeal.plus.monthly",
    provider_transaction_id: "transaction-1",
    original_transaction_id: "original-1",
    provider_signed_at: "2026-09-26T00:00:00.000Z",
    expires_at: "2026-10-26T00:00:00.000Z",
    verified_at: "2026-09-26T00:00:00.000Z",
    revoked_at: null,
    created_at: "2026-09-26T00:00:00.000Z",
    updated_at: "2026-09-26T00:00:00.000Z",
    ...overrides,
  };
}

test("active entitlements are usable until expiry", () => {
  assert.equal(isEntitlementUsable(entitlement(), NOW), true);
  assert.equal(
    isEntitlementUsable(entitlement({ expires_at: "2026-09-25T23:59:59.000Z" }), NOW),
    false
  );
});

test("grace period and billing retry retain access", () => {
  assert.equal(isEntitlementUsable(entitlement({ status: "grace_period" }), NOW), true);
  assert.equal(isEntitlementUsable(entitlement({ status: "billing_retry" }), NOW), true);
});

test("expired and revoked entitlements never grant access", () => {
  assert.equal(isEntitlementUsable(entitlement({ status: "expired" }), NOW), false);
  assert.equal(isEntitlementUsable(entitlement({ status: "revoked" }), NOW), false);
});

test("hasEntitlement checks the requested key and ignores unusable rows", () => {
  const rows = [
    entitlement({ status: "expired" }),
    entitlement({ entitlement_key: EXAMPLE_ENTITLEMENT_KEYS.dealAlerts }),
  ];
  assert.equal(hasEntitlement(rows, EXAMPLE_ENTITLEMENT_KEYS.advancedHistory, NOW), false);
  assert.equal(hasEntitlement(rows, EXAMPLE_ENTITLEMENT_KEYS.dealAlerts, NOW), true);
});

test("an entitlement without expiry can represent a manually granted access", () => {
  assert.equal(isEntitlementUsable(entitlement({ expires_at: null }), NOW), true);
});

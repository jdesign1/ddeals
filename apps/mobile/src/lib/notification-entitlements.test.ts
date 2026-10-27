import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentPremiumAccountIds } from "./notification-entitlements.ts";

const now = new Date("2026-10-27T00:00:00.000Z");

test("only current premium entitlements are eligible for push delivery", () => {
  const eligible = getCurrentPremiumAccountIds([
    { account_id: "active", entitlement_key: "premium_access", status: "active", expires_at: "2026-10-28T00:00:00.000Z" },
    { account_id: "grace", entitlement_key: "premium_access", status: "grace_period", expires_at: "2026-10-28T00:00:00.000Z" },
    { account_id: "retry", entitlement_key: "premium_access", status: "billing_retry", expires_at: "2026-10-28T00:00:00.000Z" },
    { account_id: "expired-date", entitlement_key: "premium_access", status: "active", expires_at: "2026-10-26T23:59:59.000Z" },
    { account_id: "expired-status", entitlement_key: "premium_access", status: "expired", expires_at: "2026-10-28T00:00:00.000Z" },
    { account_id: "revoked", entitlement_key: "premium_access", status: "revoked", expires_at: null },
    { account_id: "other-entitlement", entitlement_key: "deal_alerts", status: "active", expires_at: "2026-10-28T00:00:00.000Z" },
  ], now);

  assert.deepEqual([...eligible].sort(), ["active", "grace", "retry"]);
});

test("an entitlement without an expiry remains eligible when its status is current", () => {
  const eligible = getCurrentPremiumAccountIds([
    { account_id: "lifetime", entitlement_key: "premium_access", status: "active", expires_at: null },
  ], now);

  assert.deepEqual([...eligible], ["lifetime"]);
});

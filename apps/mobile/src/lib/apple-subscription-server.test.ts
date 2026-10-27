import assert from "node:assert/strict";
import test from "node:test";
import {
  entitlementExpiryForAppleState,
} from "./apple-entitlement-expiry.ts";

test("grace-period access uses Apple's signed grace expiry", () => {
  const transactionExpiry = Date.parse("2026-10-27T00:00:00.000Z");
  const graceExpiry = Date.parse("2026-10-30T00:00:00.000Z");
  assert.equal(
    entitlementExpiryForAppleState(
      { expiresDate: transactionExpiry },
      "grace_period",
      { gracePeriodExpiresDate: graceExpiry },
    ),
    new Date(graceExpiry).toISOString(),
  );
});

test("non-grace Apple states continue to use the transaction expiry", () => {
  const transactionExpiry = Date.parse("2026-11-01T00:00:00.000Z");
  assert.equal(
    entitlementExpiryForAppleState({ expiresDate: transactionExpiry }, "active", { gracePeriodExpiresDate: transactionExpiry + 86400000 }),
    new Date(transactionExpiry).toISOString(),
  );
});

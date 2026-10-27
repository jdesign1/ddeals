import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

export type AppleEntitlementStatus = "active" | "grace_period" | "billing_retry" | "expired" | "revoked";

function transactionExpiry(transaction: Pick<JWSTransactionDecodedPayload, "expiresDate">): string | null {
  if (typeof transaction.expiresDate !== "number") return null;
  const date = new Date(transaction.expiresDate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Apple gives billing grace periods in signed renewal information rather than
 * the transaction's normal period expiry. Use that later date for access so a
 * valid grace period is not cut off when the original billing period ends.
 */
export function entitlementExpiryForAppleState(
  transaction: Pick<JWSTransactionDecodedPayload, "expiresDate">,
  status: AppleEntitlementStatus,
  renewalInfo?: Pick<JWSRenewalInfoDecodedPayload, "gracePeriodExpiresDate"> | null,
): string | null {
  if (status === "grace_period" && typeof renewalInfo?.gracePeriodExpiresDate === "number") {
    const graceExpiry = new Date(renewalInfo.gracePeriodExpiresDate);
    if (Number.isFinite(graceExpiry.getTime())) return graceExpiry.toISOString();
  }
  return transactionExpiry(transaction);
}

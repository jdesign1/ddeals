import {
  isEntitlementUsable,
  type EntitlementStatus,
} from "@dodgey-deals/shared";

export interface PremiumEntitlementForNotifications {
  account_id: string;
  entitlement_key: string;
  status: EntitlementStatus;
  expires_at: string | null;
}

/**
 * Returns accounts that may receive paid price-alert notifications right now.
 * The notification worker must make this check independently of the saved
 * push preference because a subscription can expire while that preference
 * remains stored.
 */
export function getCurrentPremiumAccountIds(
  rows: readonly PremiumEntitlementForNotifications[],
  now = new Date(),
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.entitlement_key === "premium_access")
      .filter((row) => isEntitlementUsable(row, now))
      .map((row) => row.account_id),
  );
}

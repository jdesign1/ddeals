import type { SubscriptionEntitlementRecord } from "@dodgey-deals/shared";
import { isEntitlementUsable, SUBSCRIPTION_PRODUCT_IDS } from "@dodgey-deals/shared";

export type SubscriptionPlanPeriod = "monthly" | "annual" | "unknown";

export function getSubscriptionPlanPeriod(productId: string | null | undefined): SubscriptionPlanPeriod {
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return "monthly";
  if (productId === SUBSCRIPTION_PRODUCT_IDS.annual) return "annual";
  return "unknown";
}

export function getSubscriptionPlanLabel(productId: string | null | undefined): string {
  const period = getSubscriptionPlanPeriod(productId);
  if (period === "monthly") return "Monthly plan";
  if (period === "annual") return "Annual plan";
  return "Dodgy Deal Plus";
}

export function getSubscriptionRenewalLabel(productId: string | null | undefined): string {
  const period = getSubscriptionPlanPeriod(productId);
  if (period === "monthly") return "Renews monthly unless cancelled";
  if (period === "annual") return "Renews annually unless cancelled";
  return "Renews automatically unless cancelled";
}

export function getSubscriptionStatusLabel(status: SubscriptionEntitlementRecord["status"] | undefined): string {
  if (status === "grace_period") return "Active — billing grace period";
  if (status === "billing_retry") return "Active — billing being retried";
  return "Active";
}

export function formatSubscriptionDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function chooseCurrentSubscription(
  entitlements: readonly SubscriptionEntitlementRecord[],
  premiumEntitlementKey: string,
): SubscriptionEntitlementRecord | null {
  const candidates = entitlements
    .filter((entitlement) => entitlement.entitlement_key === premiumEntitlementKey)
    .sort((left, right) => {
      const leftUsable = isEntitlementUsable(left);
      const rightUsable = isEntitlementUsable(right);
      if (leftUsable !== rightUsable) return rightUsable ? 1 : -1;
      const leftExpiry = left.expires_at ? Date.parse(left.expires_at) : 0;
      const rightExpiry = right.expires_at ? Date.parse(right.expires_at) : 0;
      if (rightExpiry !== leftExpiry) return rightExpiry - leftExpiry;
      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    });
  return candidates[0] ?? null;
}

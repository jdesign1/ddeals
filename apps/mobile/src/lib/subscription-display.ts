import type { SubscriptionEntitlementRecord } from "@dodgey-deals/shared";
import { isEntitlementUsable, SUBSCRIPTION_PRODUCT_IDS } from "@dodgey-deals/shared";
import type { AppleSubscriptionProduct } from "@/lib/native-apple-subscriptions";

export type SubscriptionPlanPeriod = "monthly" | "annual" | "unknown";

const NZ_SUBSCRIPTION_DISPLAY_PRICES: Record<string, string> = {
  [SUBSCRIPTION_PRODUCT_IDS.monthly]: "NZ$1.99",
  [SUBSCRIPTION_PRODUCT_IDS.annual]: "NZ$19.99",
};

/**
 * StoreKit supplies the amount and currency for the user's App Store storefront.
 * These plans are sold only in New Zealand, so use the configured NZ price when
 * an older/foreign storefront value reaches the UI. Once StoreKit reports NZD,
 * its live amount remains authoritative; unknown products always pass through.
 */
export function formatAppleSubscriptionPrice(
  product: Pick<AppleSubscriptionProduct, "id" | "displayPrice" | "currencyCode">
): string {
  const configuredNzPrice = NZ_SUBSCRIPTION_DISPLAY_PRICES[product.id];
  if (configuredNzPrice && product.currencyCode !== "NZD") return configuredNzPrice;
  if (product.currencyCode !== "NZD") return product.displayPrice;
  if (product.displayPrice.includes("NZ$") || product.displayPrice.includes("NZD")) return product.displayPrice;
  return product.displayPrice.replace("$", "NZ$");
}

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

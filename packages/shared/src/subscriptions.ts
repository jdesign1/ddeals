import type { SupabaseClient } from "./supabase.ts";

/**
 * Subscription access is intentionally keyed rather than modelled as one
 * subscriber/non-subscriber flag. New paid capabilities can be added without
 * changing this contract or revoking existing access.
 */
export const EXAMPLE_ENTITLEMENT_KEYS = {
  advancedHistory: "advanced_history",
  dealAlerts: "deal_alerts",
  unlimitedLists: "unlimited_lists",
} as const;

export type EntitlementKey = string;

export type EntitlementStatus =
  | "active"
  | "grace_period"
  | "billing_retry"
  | "expired"
  | "revoked";

export interface SubscriptionEntitlementRecord {
  id: string;
  account_id: string;
  entitlement_key: EntitlementKey;
  status: EntitlementStatus;
  provider: string;
  product_id: string;
  provider_transaction_id: string | null;
  original_transaction_id: string | null;
  provider_signed_at: string | null;
  expires_at: string | null;
  verified_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionEventRecord {
  id: number;
  provider: string;
  provider_event_id: string;
  event_type: string;
  provider_transaction_id: string | null;
  original_transaction_id: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at: string | null;
  processing_error: string | null;
}

/** These statuses retain access while the provider state is being resolved. */
const ACCESSIBLE_STATUSES: ReadonlySet<EntitlementStatus> = new Set([
  "active",
  "grace_period",
  "billing_retry",
]);

/**
 * Returns whether one verified entitlement currently grants access.
 * `billing_retry` and `grace_period` deliberately remain usable until their
 * recorded expiry; Apple billing recovery should not abruptly remove access.
 */
export function isEntitlementUsable(
  entitlement: Pick<SubscriptionEntitlementRecord, "status" | "expires_at">,
  now = new Date()
): boolean {
  if (!ACCESSIBLE_STATUSES.has(entitlement.status)) return false;
  if (!entitlement.expires_at) return true;

  const expiry = Date.parse(entitlement.expires_at);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

/**
 * Client-side feature hook for future paywalls. It is deliberately a pure
 * read over already-verified records; the server remains authoritative for
 * writing and verifying entitlement state.
 */
export function hasEntitlement(
  entitlements: readonly SubscriptionEntitlementRecord[],
  entitlementKey: EntitlementKey,
  now = new Date()
): boolean {
  return entitlements.some(
    (entitlement) =>
      entitlement.entitlement_key === entitlementKey && isEntitlementUsable(entitlement, now)
  );
}

/** Fetches only the signed-in account's rows; Accounts Supabase RLS scopes the result. */
export async function fetchUserEntitlements(
  client: SupabaseClient
): Promise<SubscriptionEntitlementRecord[]> {
  const { data, error } = await client
    .from("subscription_entitlements")
    .select("*")
    .order("entitlement_key", { ascending: true });
  if (error) throw new Error(`fetchUserEntitlements: ${error.message}`);
  return (data as SubscriptionEntitlementRecord[]) ?? [];
}

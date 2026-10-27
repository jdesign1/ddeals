import {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import type { SupabaseClient } from "@dodgey-deals/shared";
import { requireAccountsAdmin as requireAccountsAdminBase } from "@/lib/accounts-server";
import { entitlementExpiryForAppleState, type AppleEntitlementStatus } from "@/lib/apple-entitlement-expiry";

export { entitlementExpiryForAppleState } from "@/lib/apple-entitlement-expiry";
export type { AppleEntitlementStatus } from "@/lib/apple-entitlement-expiry";

export { getAuthenticatedAccountId, isUuid } from "@/lib/accounts-server";

export const APPLE_PROVIDER = "apple_app_store";

export interface AppleSubscriptionConfig {
  bundleId: string;
  environment: Environment;
  appAppleId?: number;
  productEntitlements: ReadonlyMap<string, readonly string[]>;
}

export class AppleSubscriptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleSubscriptionConfigurationError";
  }
}

/** Keeps the Apple routes' established configuration error contract intact. */
export function requireAccountsAdmin(): SupabaseClient {
  if (!process.env.ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppleSubscriptionConfigurationError("ACCOUNTS_SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return requireAccountsAdminBase();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AppleSubscriptionConfigurationError(`${name} is not configured`);
  return value;
}

function parseEnvironment(value: string): Environment {
  if (value === Environment.PRODUCTION) return Environment.PRODUCTION;
  if (value === Environment.SANDBOX) return Environment.SANDBOX;
  throw new AppleSubscriptionConfigurationError("APPLE_STORE_ENVIRONMENT must be Production or Sandbox");
}

function parseProductEntitlements(): ReadonlyMap<string, readonly string[]> {
  const raw = requiredEnvironment("APPLE_ENTITLEMENT_PRODUCT_MAP");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppleSubscriptionConfigurationError("APPLE_ENTITLEMENT_PRODUCT_MAP must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppleSubscriptionConfigurationError("APPLE_ENTITLEMENT_PRODUCT_MAP must be a JSON object");
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new AppleSubscriptionConfigurationError("APPLE_ENTITLEMENT_PRODUCT_MAP must contain at least one product");
  }

  const result = new Map<string, readonly string[]>();
  for (const [productId, entitlementKeys] of entries) {
    if (!productId.trim() || !Array.isArray(entitlementKeys) || entitlementKeys.length === 0) {
      throw new AppleSubscriptionConfigurationError("Every Apple product must map to one or more entitlement keys");
    }
    const keys = entitlementKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0);
    if (keys.length !== entitlementKeys.length) {
      throw new AppleSubscriptionConfigurationError("Apple entitlement keys must be non-empty strings");
    }
    result.set(productId, [...new Set(keys)]);
  }
  return result;
}

export function getAppleSubscriptionConfig(): AppleSubscriptionConfig {
  const environment = parseEnvironment(requiredEnvironment("APPLE_STORE_ENVIRONMENT"));
  const bundleId = requiredEnvironment("APPLE_BUNDLE_ID");
  const productEntitlements = parseProductEntitlements();
  const appAppleIdValue = process.env.APPLE_APPLE_ID?.trim();
  const appAppleId = appAppleIdValue ? Number(appAppleIdValue) : undefined;

  if (environment === Environment.PRODUCTION && (!appAppleId || !Number.isSafeInteger(appAppleId))) {
    throw new AppleSubscriptionConfigurationError("APPLE_APPLE_ID is required for Production verification");
  }

  return { bundleId, environment, appAppleId, productEntitlements };
}

function readRootCertificate(name: string): Buffer | null {
  const value = process.env[name]?.replace(/\s+/g, "").trim();
  return value ? Buffer.from(value, "base64") : null;
}

export function createAppleSignedDataVerifier(config = getAppleSubscriptionConfig()): SignedDataVerifier {
  const roots = [readRootCertificate("APPLE_ROOT_CA_G2_BASE64"), readRootCertificate("APPLE_ROOT_CA_G3_BASE64")].filter(
    (root): root is Buffer => Boolean(root && root.length > 0)
  );
  if (roots.length === 0) {
    throw new AppleSubscriptionConfigurationError(
      "At least one Apple root certificate is required (APPLE_ROOT_CA_G2_BASE64 or APPLE_ROOT_CA_G3_BASE64)"
    );
  }
  return new SignedDataVerifier(roots, true, config.environment, config.bundleId, config.appAppleId);
}

export function getEntitlementKeys(config: AppleSubscriptionConfig, productId: string): readonly string[] {
  const keys = config.productEntitlements.get(productId);
  if (!keys) throw new AppleSubscriptionConfigurationError(`Apple product is not mapped: ${productId}`);
  return keys;
}

export function isValidJws(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128_000 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function entitlementStatusForTransaction(
  transaction: Pick<JWSTransactionDecodedPayload, "expiresDate" | "revocationDate">,
  notificationType?: string,
  subtype?: string,
  now = Date.now()
): AppleEntitlementStatus {
  if (
    transaction.revocationDate ||
    notificationType === NotificationTypeV2.REFUND ||
    notificationType === NotificationTypeV2.REVOKE
  ) {
    return "revoked";
  }
  if (notificationType === NotificationTypeV2.EXPIRED || notificationType === NotificationTypeV2.GRACE_PERIOD_EXPIRED) {
    return "expired";
  }
  if (notificationType === NotificationTypeV2.DID_FAIL_TO_RENEW) {
    return subtype === "GRACE_PERIOD" ? "grace_period" : "billing_retry";
  }
  if (typeof transaction.expiresDate === "number" && transaction.expiresDate <= now) return "expired";
  return "active";
}

export function transactionSignedAt(transaction: Pick<JWSTransactionDecodedPayload, "signedDate">): string {
  const date = typeof transaction.signedDate === "number" ? new Date(transaction.signedDate) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function transactionExpiry(transaction: Pick<JWSTransactionDecodedPayload, "expiresDate">): string | null {
  if (typeof transaction.expiresDate !== "number") return null;
  const date = new Date(transaction.expiresDate);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Apple gives billing grace periods in signed renewal information rather than
 * the transaction's normal period expiry. Use that later date for access so a
 * valid grace period is not cut off when the original billing period ends.
 */
export function safeRenewalPayload(
  renewalInfo: Pick<JWSRenewalInfoDecodedPayload, "originalTransactionId" | "productId" | "signedDate" | "gracePeriodExpiresDate" | "isInBillingRetryPeriod" | "autoRenewStatus" | "expirationIntent"> | null,
): Record<string, unknown> | null {
  if (!renewalInfo) return null;
  return {
    originalTransactionId: renewalInfo.originalTransactionId ?? null,
    productId: renewalInfo.productId ?? null,
    signedDate: renewalInfo.signedDate ?? null,
    gracePeriodExpiresDate: renewalInfo.gracePeriodExpiresDate ?? null,
    isInBillingRetryPeriod: renewalInfo.isInBillingRetryPeriod ?? null,
    autoRenewStatus: renewalInfo.autoRenewStatus ?? null,
    expirationIntent: renewalInfo.expirationIntent ?? null,
  };
}

export function safeTransactionPayload(transaction: JWSTransactionDecodedPayload): Record<string, unknown> {
  return {
    transactionId: transaction.transactionId ?? null,
    originalTransactionId: transaction.originalTransactionId ?? null,
    productId: transaction.productId ?? null,
    bundleId: transaction.bundleId ?? null,
    environment: transaction.environment ?? null,
    appAccountToken: transaction.appAccountToken ?? null,
    signedDate: transaction.signedDate ?? null,
    purchaseDate: transaction.purchaseDate ?? null,
    expiresDate: transaction.expiresDate ?? null,
    revocationDate: transaction.revocationDate ?? null,
  };
}

export function safeNotificationPayload(notification: ResponseBodyV2DecodedPayload): Record<string, unknown> {
  return {
    notificationUUID: notification.notificationUUID ?? null,
    notificationType: notification.notificationType ?? null,
    subtype: notification.subtype ?? null,
    version: notification.version ?? null,
    signedDate: notification.signedDate ?? null,
    environment: notification.data?.environment ?? null,
  };
}

export async function upsertAppleEntitlements(params: {
  accounts: SupabaseClient;
  accountId: string;
  transaction: JWSTransactionDecodedPayload;
  entitlementKeys: readonly string[];
  status: AppleEntitlementStatus;
  accessExpiresAt?: string | null;
}): Promise<void> {
  const signedAt = transactionSignedAt(params.transaction);
  const expiresAt = params.accessExpiresAt ?? transactionExpiry(params.transaction);
  const providerTransactionId = params.transaction.transactionId ?? null;
  const originalTransactionId = params.transaction.originalTransactionId ?? null;
  if (!providerTransactionId || !originalTransactionId || !params.transaction.productId) {
    throw new Error("Apple transaction is missing a required identifier");
  }

  const verifiedAt = new Date().toISOString();
  const revokedAt = params.status === "revoked" ? verifiedAt : null;
  for (const entitlementKey of params.entitlementKeys) {
    const { error } = await params.accounts.rpc("upsert_subscription_entitlement_if_newer", {
      p_account_id: params.accountId,
      p_entitlement_key: entitlementKey,
      p_status: params.status,
      p_provider: APPLE_PROVIDER,
      p_product_id: params.transaction.productId,
      p_provider_transaction_id: providerTransactionId,
      p_original_transaction_id: originalTransactionId,
      p_expires_at: expiresAt,
      p_provider_signed_at: signedAt,
      p_verified_at: verifiedAt,
      p_revoked_at: revokedAt,
    });
    if (error) throw new Error(`Could not save subscription entitlement: ${error.message}`);
  }
}

export async function recordAppleEvent(params: {
  accounts: SupabaseClient;
  eventId: string;
  eventType: string;
  transaction: JWSTransactionDecodedPayload | null;
  payload: Record<string, unknown>;
  processedAt?: string | null;
  processingError?: string | null;
}): Promise<void> {
  const { error } = await params.accounts.from("subscription_events").upsert(
    {
      provider: APPLE_PROVIDER,
      provider_event_id: params.eventId,
      event_type: params.eventType,
      provider_transaction_id: params.transaction?.transactionId ?? null,
      original_transaction_id: params.transaction?.originalTransactionId ?? null,
      payload: params.payload,
      processed_at: params.processedAt ?? null,
      processing_error: params.processingError ?? null,
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: false }
  );
  if (error) throw new Error(`Could not record subscription event: ${error.message}`);
}

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { SUBSCRIPTION_PRODUCT_IDS } from "@dodgey-deals/shared";
import { appleTransactionVerificationKey } from "@/lib/subscription-verification";

export interface AppleSubscriptionProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  currencyCode?: string;
  type: string;
}
export interface AppleSubscriptionTransaction {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  jwsRepresentation: string;
  environment: string;
  expiresDate: string | null;
  revocationDate: string | null;
}

interface DodgySubscriptionsPlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: AppleSubscriptionProduct[] }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<AppleSubscriptionTransaction>;
  currentEntitlements(): Promise<{ transactions: AppleSubscriptionTransaction[] }>;
  restore(): Promise<{ transactions: AppleSubscriptionTransaction[] }>;
  finish(options: { transactionId: string; productId: string }): Promise<{ finished: boolean }>;
  addListener(
    eventName: "transactionUpdated",
    listenerFunc: (event: { transaction: AppleSubscriptionTransaction }) => void
  ): Promise<PluginListenerHandle>;
}

export const DodgySubscriptions = registerPlugin<DodgySubscriptionsPlugin>("DodgySubscriptions");

class AppleSubscriptionVerificationError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AppleSubscriptionVerificationError";
    this.status = status;
    this.retryable = status === 408 || status === 429 || status >= 500;
    this.code = code;
  }
}

// A purchase is returned immediately by StoreKit and then also emitted through
// Transaction.updates. Share the same verification promise for both paths so
// one Apple transaction cannot trigger two server writes or two finish calls.
const transactionVerificationPromises = new Map<string, Promise<void>>();

const VERIFICATION_RETRY_DELAYS_MS = [350, 900];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function isNativeAppleSubscriptionsPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function isNativeAppleSubscriptionsAvailable(): boolean {
  return isNativeAppleSubscriptionsPlatform() && Capacitor.isPluginAvailable("DodgySubscriptions");
}

export function configuredAppleProductIds(): string[] {
  const configuredIds = (process.env.NEXT_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_IDS ?? "")
    .split(",")
    .map((productId) => productId.trim())
    .filter(Boolean);
  return configuredIds.length > 0
    ? configuredIds
    : [SUBSCRIPTION_PRODUCT_IDS.monthly, SUBSCRIPTION_PRODUCT_IDS.annual];
}

export async function verifyAppleSubscriptionTransaction(
  transaction: AppleSubscriptionTransaction,
  accessToken: string,
  accountId: string,
): Promise<void> {
  const key = appleTransactionVerificationKey(transaction.transactionId, transaction.jwsRepresentation, accountId);
  const existingVerification = transactionVerificationPromises.get(key);
  if (existingVerification) return existingVerification;

  const verification = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetch("/api/subscriptions/apple/verify", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ signedTransaction: transaction.jwsRepresentation }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { code?: string; error?: string } | null;
          throw new AppleSubscriptionVerificationError(
            payload?.error || "We could not verify the Apple subscription.",
            response.status,
            payload?.code,
          );
        }
        // The entitlement write above is the authoritative success. Finishing
        // is StoreKit cleanup; if it is temporarily unavailable, let the
        // caller unlock the account and allow Transaction.updates to retry the
        // cleanup later instead of reporting a failed purchase to the user.
        try {
          await finishAppleSubscriptionTransaction(transaction.transactionId, transaction.productId);
        } catch {
          // Keep the transaction unfinished so StoreKit can deliver it again.
        }
        return;
      } catch (error) {
        const retryable = error instanceof AppleSubscriptionVerificationError
          ? error.retryable
          : true;
        const retryDelay = VERIFICATION_RETRY_DELAYS_MS[attempt];
        if (!retryable || retryDelay === undefined) throw error;
        await wait(retryDelay);
      }
    }
  })();

  transactionVerificationPromises.set(key, verification);
  try {
    await verification;
  } finally {
    if (transactionVerificationPromises.get(key) === verification) transactionVerificationPromises.delete(key);
  }
}

export async function finishAppleSubscriptionTransaction(transactionId: string, productId: string): Promise<{ finished: boolean }> {
  if (!isNativeAppleSubscriptionsAvailable()) return { finished: false };
  return DodgySubscriptions.finish({ transactionId, productId });
}

export async function loadAppleSubscriptionProducts(): Promise<AppleSubscriptionProduct[]> {
  if (!isNativeAppleSubscriptionsAvailable()) return [];
  const { products } = await DodgySubscriptions.getProducts({ productIds: configuredAppleProductIds() });
  return products;
}

export async function purchaseAppleSubscription(productId: string, accountId: string, accessToken: string): Promise<AppleSubscriptionTransaction> {
  if (!isNativeAppleSubscriptionsAvailable()) throw new Error("Apple subscriptions are only available in the iOS app.");
  const transaction = await DodgySubscriptions.purchase({ productId, appAccountToken: accountId });
  await verifyAppleSubscriptionTransaction(transaction, accessToken, accountId);
  return transaction;
}

export async function syncCurrentAppleSubscriptions(accessToken: string, accountId: string): Promise<number> {
  if (!isNativeAppleSubscriptionsAvailable()) return 0;
  const { transactions } = await DodgySubscriptions.currentEntitlements();
  for (const transaction of transactions) await verifyAppleSubscriptionTransaction(transaction, accessToken, accountId);
  return transactions.length;
}

export async function restoreAppleSubscriptions(accessToken: string, accountId: string): Promise<number> {
  if (!isNativeAppleSubscriptionsAvailable()) return 0;
  const { transactions } = await DodgySubscriptions.restore();
  for (const transaction of transactions) await verifyAppleSubscriptionTransaction(transaction, accessToken, accountId);
  return transactions.length;
}

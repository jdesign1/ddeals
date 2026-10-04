import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface AppleSubscriptionProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
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
  addListener(
    eventName: "transactionUpdated",
    listenerFunc: (event: { transaction: AppleSubscriptionTransaction }) => void
  ): Promise<PluginListenerHandle>;
}

export const DodgySubscriptions = registerPlugin<DodgySubscriptionsPlugin>("DodgySubscriptions");

export function isNativeAppleSubscriptionsAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function configuredAppleProductIds(): string[] {
  return (process.env.NEXT_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_IDS ?? "")
    .split(",")
    .map((productId) => productId.trim())
    .filter(Boolean);
}

async function verifyTransaction(transaction: AppleSubscriptionTransaction, accessToken: string): Promise<void> {
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
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "We could not verify the Apple subscription.");
  }
}

export async function loadAppleSubscriptionProducts(): Promise<AppleSubscriptionProduct[]> {
  if (!isNativeAppleSubscriptionsAvailable()) return [];
  const { products } = await DodgySubscriptions.getProducts({ productIds: configuredAppleProductIds() });
  return products;
}

export async function purchaseAppleSubscription(productId: string, accountId: string, accessToken: string): Promise<AppleSubscriptionTransaction> {
  if (!isNativeAppleSubscriptionsAvailable()) throw new Error("Apple subscriptions are only available in the iOS app.");
  const transaction = await DodgySubscriptions.purchase({ productId, appAccountToken: accountId });
  await verifyTransaction(transaction, accessToken);
  return transaction;
}

export async function syncCurrentAppleSubscriptions(accessToken: string): Promise<number> {
  if (!isNativeAppleSubscriptionsAvailable()) return 0;
  const { transactions } = await DodgySubscriptions.currentEntitlements();
  for (const transaction of transactions) await verifyTransaction(transaction, accessToken);
  return transactions.length;
}

export async function restoreAppleSubscriptions(accessToken: string): Promise<number> {
  if (!isNativeAppleSubscriptionsAvailable()) return 0;
  const { transactions } = await DodgySubscriptions.restore();
  for (const transaction of transactions) await verifyTransaction(transaction, accessToken);
  return transactions.length;
}

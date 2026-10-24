"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  fetchUserEntitlements,
  hasEntitlement,
  SUBSCRIPTION_ENTITLEMENT_KEYS,
  SUBSCRIPTION_PRODUCT_IDS,
  type SubscriptionEntitlementRecord,
} from "@dodgey-deals/shared";
import { useAuth } from "@/lib/auth-context";
import { getAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import { chooseCurrentSubscription } from "@/lib/subscription-display";
import {
  configuredAppleProductIds,
  DodgySubscriptions,
  isNativeAppleSubscriptionsAvailable,
  isNativeAppleSubscriptionsPlatform,
  loadAppleSubscriptionProducts,
  purchaseAppleSubscription,
  restoreAppleSubscriptions,
  syncCurrentAppleSubscriptions,
  verifyAppleSubscriptionTransaction,
  type AppleSubscriptionProduct,
} from "@/lib/native-apple-subscriptions";
import { subscriptionErrorMessage } from "@/lib/subscription-errors";

interface SubscriptionContextValue {
  entitlements: SubscriptionEntitlementRecord[];
  isPremium: boolean;
  loading: boolean;
  error: string | null;
  products: AppleSubscriptionProduct[];
  productsLoading: boolean;
  busyProductId: string | null;
  restoring: boolean;
  isNativeAvailable: boolean;
  currentSubscription: SubscriptionEntitlementRecord | null;
  openSubscriptionPage: () => void;
  refresh: () => Promise<SubscriptionEntitlementRecord[] | null>;
  purchase: (productId: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function productSortValue(productId: string): number {
  if (productId === SUBSCRIPTION_PRODUCT_IDS.annual) return 0;
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return 1;
  return 2;
}

const PREMIUM_REFRESH_DELAYS_MS = [250, 750, 1500, 3000, 5000, 5000];

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, session, openAuthSheet } = useAuth();
  const router = useRouter();
  const client = getAccountsSupabaseClient();
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlementRecord[]>([]);
  const [products, setProducts] = useState<AppleSubscriptionProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [nativeEntitlementsSyncedKey, setNativeEntitlementsSyncedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const purchaseInFlightRef = useRef(false);
  const refreshRequestRef = useRef(0);

  const nativeAvailable = isNativeAppleSubscriptionsAvailable();
  const nativeAppleApp = isNativeAppleSubscriptionsPlatform();
  const unavailableMessage = nativeAppleApp
    ? "Subscriptions need the latest version of the app. Please update the app to subscribe."
    : "Subscriptions are available in the iOS app. Sign in there with this same account to subscribe.";
  const configuredProductIds = configuredAppleProductIds();
  const configuredProductIdsKey = configuredProductIds.join(",");
  const isPremium = hasEntitlement(entitlements, SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess);
  const currentSubscription = chooseCurrentSubscription(entitlements, SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess);
  const nativeEntitlementsSessionKey = nativeAvailable && user && session
    ? `${user.id}:${session.expires_at ?? ""}`
    : null;
  const nativeEntitlementsLoading = nativeEntitlementsSessionKey !== null && nativeEntitlementsSyncedKey !== nativeEntitlementsSessionKey;

  const refresh = useCallback(async () => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;

    if (!client || !user) {
      if (requestId === refreshRequestRef.current) {
        setEntitlements([]);
        setLoading(false);
      }
      return [];
    }

    setLoading(true);
    try {
      const nextEntitlements = await fetchUserEntitlements(client);
      if (requestId !== refreshRequestRef.current) return null;
      setEntitlements(nextEntitlements);
      setError(null);
      return nextEntitlements;
    } catch (refreshError) {
      if (requestId === refreshRequestRef.current) setError(subscriptionErrorMessage(refreshError));
      // Preserve the distinction between "no entitlement" and "could not
      // read entitlements" so the success screen does not redirect on a
      // temporary network or backend failure.
      return null;
    } finally {
      if (requestId === refreshRequestRef.current) setLoading(false);
    }
  }, [client, user]);

  const refreshUntilPremium = useCallback(async (): Promise<boolean> => {
    let nextEntitlements = await refresh();
    if (nextEntitlements && hasEntitlement(nextEntitlements, SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess)) return true;

    // The server writes the entitlement before responding, but the client can
    // briefly read before that write is visible. A bounded backoff keeps the
    // UI and server gates in step without failing a valid payment too early.
    for (const delay of PREMIUM_REFRESH_DELAYS_MS) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
      nextEntitlements = await refresh();
      if (nextEntitlements && hasEntitlement(nextEntitlements, SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess)) return true;
    }
    return false;
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!nativeAvailable || !user || !session || !nativeEntitlementsSessionKey) return;
    let cancelled = false;
    let transactionHandle: { remove: () => Promise<void> } | undefined;
    const syncKey = nativeEntitlementsSessionKey;

    void DodgySubscriptions.addListener("transactionUpdated", ({ transaction }) => {
      void verifyAppleSubscriptionTransaction(transaction, session.access_token, user.id)
        .then(() => {
          if (!cancelled) void refresh();
        })
        .catch((syncError) => {
          if (!cancelled) setError(subscriptionErrorMessage(syncError));
        });
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else transactionHandle = handle;
    });

    void syncCurrentAppleSubscriptions(session.access_token, user.id)
      .then(() => {
        if (!cancelled) return refresh();
        return undefined;
      })
      .catch((syncError) => {
        if (!cancelled) setError(subscriptionErrorMessage(syncError));
      })
      .finally(() => {
        if (!cancelled) setNativeEntitlementsSyncedKey(syncKey);
      });
    return () => {
      cancelled = true;
      void transactionHandle?.remove();
    };
  }, [nativeAvailable, nativeEntitlementsSessionKey, refresh, session, user]);

  useEffect(() => {
    let cancelled = false;
    if (!nativeAvailable || configuredProductIdsKey.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    void loadAppleSubscriptionProducts()
      .then((nextProducts) => {
        if (!cancelled) {
          setProducts([...nextProducts].sort((a, b) => productSortValue(a.id) - productSortValue(b.id)));
          setProductsLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setProductsLoading(false);
          setError(subscriptionErrorMessage(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configuredProductIdsKey, nativeAvailable]);

  const purchase = useCallback(async (productId: string): Promise<boolean> => {
    if (!user || !session) {
      openAuthSheet("Create a free Dodgy Deal account before subscribing.");
      return false;
    }
    if (!nativeAvailable) {
      setError(unavailableMessage);
      return false;
    }
    if (purchaseInFlightRef.current) return false;

    purchaseInFlightRef.current = true;
    setBusyProductId(productId);
    setError(null);
    try {
      await purchaseAppleSubscription(productId, user.id, session.access_token);
      if (!await refreshUntilPremium()) {
        throw new Error("SUBSCRIPTION_SYNC_PENDING");
      }
      router.push("/subscribe/success");
      return true;
    } catch (purchaseError) {
      // A StoreKit purchase can complete even if the first server sync is
      // interrupted. The transaction remains available to currentEntitlements
      // until it is finished, so reconcile it once before showing an error.
      if (!/USER_CANCELLED|cancelled|\bPENDING\b|PRODUCT_NOT_FOUND|PRODUCTS_UNAVAILABLE/i.test(String(purchaseError))) {
        try {
          await syncCurrentAppleSubscriptions(session.access_token, user.id);
        } catch {
          // The final entitlement read below is still useful if the server
          // saved the entitlement but a later cleanup/event step failed.
        }
        try {
          if (await refreshUntilPremium()) {
            router.push("/subscribe/success");
            return true;
          }
        } catch {
          // Keep the original purchase error for the user-facing message.
        }
      }
      if (/USER_CANCELLED|cancelled/i.test(String(purchaseError))) {
        setError(null);
        return false;
      }
      setError(subscriptionErrorMessage(purchaseError));
      return false;
    } finally {
      purchaseInFlightRef.current = false;
      setBusyProductId(null);
    }
  }, [nativeAvailable, openAuthSheet, refreshUntilPremium, router, session, unavailableMessage, user]);

  const restore = useCallback(async (): Promise<boolean> => {
    if (!user || !session) {
      openAuthSheet("Sign in to restore your Apple subscription.");
      return false;
    }
    if (!nativeAvailable) {
      setError(unavailableMessage);
      return false;
    }
    if (purchaseInFlightRef.current || restoring) return false;

    purchaseInFlightRef.current = true;
    setRestoring(true);
    setError(null);
    try {
      const transactionCount = await restoreAppleSubscriptions(session.access_token, user.id);
      if (transactionCount === 0) throw new Error("No active Apple subscription was found.");
      if (!await refreshUntilPremium()) throw new Error("SUBSCRIPTION_SYNC_PENDING");
      router.push("/subscribe/success");
      return true;
    } catch (restoreError) {
      if (!/USER_CANCELLED|cancelled|No active Apple subscription|not linked|linked to another Dodgy Deal account|PRODUCT_NOT_FOUND|PRODUCTS_UNAVAILABLE/i.test(String(restoreError))) {
        try {
          await syncCurrentAppleSubscriptions(session.access_token, user.id);
          if (await refreshUntilPremium()) {
            router.push("/subscribe/success");
            return true;
          }
        } catch {
          // Keep the original restore error for the user-facing message.
        }
      }
      setError(subscriptionErrorMessage(restoreError));
      return false;
    } finally {
      purchaseInFlightRef.current = false;
      setRestoring(false);
    }
  }, [nativeAvailable, openAuthSheet, refreshUntilPremium, restoring, router, session, unavailableMessage, user]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    entitlements,
    isPremium,
    loading: loading || nativeEntitlementsLoading,
    error,
    products,
    productsLoading,
    busyProductId,
    restoring,
    isNativeAvailable: nativeAvailable,
    currentSubscription,
    openSubscriptionPage: () => {
      setError(null);
      router.push("/subscribe");
    },
    refresh,
    purchase,
    restore,
  }), [busyProductId, currentSubscription, entitlements, error, isPremium, loading, nativeAvailable, nativeEntitlementsLoading, products, productsLoading, purchase, refresh, restore, restoring, router]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptions(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("useSubscriptions must be used inside SubscriptionProvider");
  return context;
}

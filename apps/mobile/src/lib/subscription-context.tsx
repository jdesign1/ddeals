"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Sparkles, X } from "lucide-react";
import {
  fetchUserEntitlements,
  hasEntitlement,
  SUBSCRIPTION_ENTITLEMENT_KEYS,
  SUBSCRIPTION_PRODUCT_IDS,
  type SubscriptionEntitlementRecord,
} from "@dodgey-deals/shared";
import BottomSheetPortal from "@/components/BottomSheetPortal";
import { useAuth } from "@/lib/auth-context";
import { getAccountsSupabaseClient } from "@/lib/accounts-supabase-client";
import {
  configuredAppleProductIds,
  isNativeAppleSubscriptionsAvailable,
  loadAppleSubscriptionProducts,
  purchaseAppleSubscription,
  restoreAppleSubscriptions,
  syncCurrentAppleSubscriptions,
  type AppleSubscriptionProduct,
} from "@/lib/native-apple-subscriptions";
import { AnimatePresence, motion } from "motion/react";

interface SubscriptionContextValue {
  entitlements: SubscriptionEntitlementRecord[];
  isPremium: boolean;
  loading: boolean;
  error: string | null;
  products: AppleSubscriptionProduct[];
  isNativeAvailable: boolean;
  openSubscriptionSheet: () => void;
  closeSubscriptionSheet: () => void;
  refresh: () => Promise<void>;
  purchase: (productId: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

function subscriptionError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "We couldn't update your subscription. Please try again.";
}

function productSortValue(productId: string): number {
  if (productId === SUBSCRIPTION_PRODUCT_IDS.annual) return 0;
  if (productId === SUBSCRIPTION_PRODUCT_IDS.monthly) return 1;
  return 2;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, session, openAuthSheet } = useAuth();
  const client = getAccountsSupabaseClient();
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlementRecord[]>([]);
  const [products, setProducts] = useState<AppleSubscriptionProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionSheetOpen, setIsSubscriptionSheetOpen] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const nativeAvailable = isNativeAppleSubscriptionsAvailable();
  const configuredProductIds = configuredAppleProductIds();
  const isPremium = hasEntitlement(entitlements, SUBSCRIPTION_ENTITLEMENT_KEYS.premiumAccess);

  const refresh = useCallback(async () => {
    if (!client || !user) {
      setEntitlements([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextEntitlements = await fetchUserEntitlements(client);
      setEntitlements(nextEntitlements);
      setError(null);
    } catch (refreshError) {
      setError(subscriptionError(refreshError));
    } finally {
      setLoading(false);
    }
  }, [client, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!nativeAvailable || !user || !session) return;
    let cancelled = false;
    void syncCurrentAppleSubscriptions(session.access_token)
      .then((syncedCount) => {
        if (!cancelled && syncedCount > 0) return refresh();
        return undefined;
      })
      .catch((syncError) => {
        if (!cancelled) setError(subscriptionError(syncError));
      });
    return () => {
      cancelled = true;
    };
  }, [nativeAvailable, refresh, session, user]);

  useEffect(() => {
    let cancelled = false;
    if (!nativeAvailable || configuredProductIds.length === 0) {
      setProducts([]);
      return () => {
        cancelled = true;
      };
    }

    void loadAppleSubscriptionProducts()
      .then((nextProducts) => {
        if (!cancelled) setProducts([...nextProducts].sort((a, b) => productSortValue(a.id) - productSortValue(b.id)));
      })
      .catch((loadError) => {
        if (!cancelled) setError(subscriptionError(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [configuredProductIds.join(","), nativeAvailable]);

  const purchase = useCallback(async (productId: string): Promise<boolean> => {
    if (!user || !session) {
      openAuthSheet("Create a free Dodgy Deal account before subscribing.");
      return false;
    }
    if (!nativeAvailable) {
      setError("Subscriptions are available in the iOS app.");
      return false;
    }

    setBusyProductId(productId);
    setError(null);
    try {
      await purchaseAppleSubscription(productId, user.id, session.access_token);
      await refresh();
      setIsSubscriptionSheetOpen(false);
      return true;
    } catch (purchaseError) {
      setError(subscriptionError(purchaseError));
      return false;
    } finally {
      setBusyProductId(null);
    }
  }, [nativeAvailable, openAuthSheet, refresh, session, user]);

  const restore = useCallback(async (): Promise<boolean> => {
    if (!user || !session) {
      openAuthSheet("Create a free Dodgy Deal account before restoring a subscription.");
      return false;
    }
    if (!nativeAvailable) {
      setError("Subscriptions are available in the iOS app.");
      return false;
    }

    setBusyProductId("restore");
    setError(null);
    try {
      await restoreAppleSubscriptions(session.access_token);
      await refresh();
      return true;
    } catch (restoreError) {
      setError(subscriptionError(restoreError));
      return false;
    } finally {
      setBusyProductId(null);
    }
  }, [nativeAvailable, openAuthSheet, refresh, session, user]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    entitlements,
    isPremium,
    loading,
    error,
    products,
    isNativeAvailable: nativeAvailable,
    openSubscriptionSheet: () => {
      setError(null);
      setIsSubscriptionSheetOpen(true);
    },
    closeSubscriptionSheet: () => setIsSubscriptionSheetOpen(false),
    refresh,
    purchase,
    restore,
  }), [entitlements, error, isPremium, loading, nativeAvailable, products, purchase, refresh, restore]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
      <SubscriptionSheet
        open={isSubscriptionSheetOpen}
        userIsSignedIn={Boolean(user && session)}
        nativeAvailable={nativeAvailable}
        products={products}
        busyProductId={busyProductId}
        error={error}
        isPremium={isPremium}
        onClose={() => setIsSubscriptionSheetOpen(false)}
        onSignIn={() => {
          setIsSubscriptionSheetOpen(false);
          openAuthSheet("Create a free Dodgy Deal account before subscribing.");
        }}
        onPurchase={(productId) => void purchase(productId)}
        onRestore={() => void restore()}
      />
    </SubscriptionContext.Provider>
  );
}

function SubscriptionSheet({
  open,
  userIsSignedIn,
  nativeAvailable,
  products,
  busyProductId,
  error,
  isPremium,
  onClose,
  onSignIn,
  onPurchase,
  onRestore,
}: {
  open: boolean;
  userIsSignedIn: boolean;
  nativeAvailable: boolean;
  products: AppleSubscriptionProduct[];
  busyProductId: string | null;
  error: string | null;
  isPremium: boolean;
  onClose: () => void;
  onSignIn: () => void;
  onPurchase: (productId: string) => void;
  onRestore: () => void;
}) {
  return (
    <BottomSheetPortal open={open}>
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close subscription options"
              className="dd-bottom-sheet-backdrop fixed inset-0 z-[60] mx-auto w-full max-w-[480px] bg-stone-900/40"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="subscription-sheet-title"
              className="dd-bottom-sheet dd-bottom-sheet-surface fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-3xl shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
            >
              <div className="dd-bottom-sheet-titlebar flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fair-100 text-ink-900" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
                  <h2 id="subscription-sheet-title" className="dd-type-sheet-title text-stone-900">Keep watching prices</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"><X className="h-5 w-5" aria-hidden="true" /></button>
              </div>

              <div className="flex flex-col gap-4 px-5 py-5 pb-safe-sm">
                <p className="dd-type-body text-stone-600">The full deal assessment stays free. Subscribe when you want Dodgy Deal to keep watching prices for you.</p>
                <div className="flex flex-col gap-2">
                  {["Unlimited Watchlist items", "Automatic price-drop alerts", "Alerts for genuinely good deals", "Custom alert preferences"].map((benefit) => (
                    <div key={benefit} className="flex items-center gap-2 text-sm font-semibold text-stone-700"><Check className="h-4 w-4 shrink-0 text-fair-700" aria-hidden="true" />{benefit}</div>
                  ))}
                </div>

                {!userIsSignedIn && (
                  <button type="button" onClick={onSignIn} className="dd-btn dd-btn-primary w-full cursor-pointer">Create a free account to continue</button>
                )}

                {userIsSignedIn && !nativeAvailable && (
                  <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold leading-5 text-stone-600">Subscriptions are available in the iOS app. Sign in there with this same account to subscribe or restore access.</p>
                )}

                {userIsSignedIn && nativeAvailable && products.length > 0 && (
                  <div className="flex flex-col gap-3" aria-label="Subscription plans">
                    {products.map((product) => {
                      const isAnnual = product.id === SUBSCRIPTION_PRODUCT_IDS.annual;
                      const isBusy = busyProductId === product.id;
                      return (
                        <button key={product.id} type="button" onClick={() => onPurchase(product.id)} disabled={busyProductId !== null} className={`relative flex min-h-16 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60 ${isAnnual ? "border-ink-900 bg-ink-900 text-white" : "border-stone-300 bg-white text-stone-900"}`}>
                          {isAnnual && <span className="absolute -top-2.5 left-4 rounded-full bg-fair-500 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-900">Best value</span>}
                          <span><span className="block text-sm font-extrabold">{isAnnual ? "Annual" : "Monthly"}</span><span className={`mt-0.5 block text-xs ${isAnnual ? "text-white/70" : "text-stone-500"}`}>One month free, then {isAnnual ? "NZ$24/year" : "NZ$2/month"}</span></span>
                          <span className="shrink-0 text-sm font-extrabold">{isBusy ? "Starting…" : product.displayPrice}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {userIsSignedIn && nativeAvailable && products.length === 0 && (
                  <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold leading-5 text-stone-600">Subscription products are being prepared. Please check again after App Store Connect setup is complete.</p>
                )}

                {error && <p role="alert" className="rounded-xl bg-alert-50 px-3 py-2 text-sm font-semibold text-alert-700">{error}</p>}

                {userIsSignedIn && nativeAvailable && (
                  <button type="button" onClick={onRestore} disabled={busyProductId !== null} className="dd-btn dd-btn-outline-muted w-full cursor-pointer disabled:cursor-wait disabled:opacity-60">{busyProductId === "restore" ? "Restoring…" : "Restore purchases"}</button>
                )}

                {isPremium && <p className="text-center text-xs font-semibold text-stone-500">Your subscription is active.</p>}
                <p className="text-center text-xs leading-4 text-stone-500">Subscriptions renew automatically until cancelled in Apple Account settings.</p>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </BottomSheetPortal>
  );
}

export function useSubscriptions(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("useSubscriptions must be used inside SubscriptionProvider");
  return context;
}

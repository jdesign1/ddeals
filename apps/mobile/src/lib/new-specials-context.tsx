"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { useSearch } from "./search-context";
import {
  clearNewSpecialsPending,
  createNewSpecialsPending,
  createNewSpecialsSnapshot,
  getNewSpecialsStorageScope,
  isNewSpecialsPendingActive,
  isNewSpecialsPopupPresented,
  readNewSpecialsPending,
  readNewSpecialsSnapshot,
  removeReviewedNewSpecials,
  summarizeNewSpecials,
  writeNewSpecialsPending,
  writeNewSpecialsSnapshot,
  type NewSpecialsPending,
  type NewSpecialsSnapshot,
  type NewSpecialsSummary,
} from "./new-specials";
import type { DealFilter } from "./deal-filters";

interface NewSpecialsContextValue {
  digest: NewSpecialsSummary | null;
  hasPendingDigest: boolean;
  popupPresented: boolean;
  openRequested: boolean;
  requestOpen: () => void;
  consumeOpenRequest: () => void;
  markPopupShown: () => void;
  markReviewed: (dealKeys?: string[], filter?: DealFilter) => void;
}

interface StoredNewSpecialsState {
  scope: string | null;
  snapshot: NewSpecialsSnapshot | null;
  pending: NewSpecialsPending | null;
}

const NewSpecialsContext = createContext<NewSpecialsContextValue | null>(null);

function snapshotFingerprint(snapshot: NewSpecialsSnapshot): string {
  return JSON.stringify(snapshot.deals);
}

function summaryFingerprint(summary: NewSpecialsSummary): string {
  return JSON.stringify({
    ...summary,
    allDealKeys: [...summary.allDealKeys].sort(),
    realDealKeys: [...summary.realDealKeys].sort(),
    dodgyDealKeys: [...summary.dodgyDealKeys].sort(),
    newlyStartedDealKeys: [...summary.newlyStartedDealKeys].sort(),
    priceDropDealKeys: [...summary.priceDropDealKeys].sort(),
  });
}

function filterReviewKeys(summary: NewSpecialsSummary, dealKeys?: string[], filter: DealFilter = "all"): string[] {
  const requested = dealKeys?.length ? new Set(dealKeys) : null;
  const eligible = filter === "real"
    ? summary.realDealKeys
    : filter === "dodgy"
      ? summary.dodgyDealKeys
      : summary.allDealKeys;
  return requested ? eligible.filter((key) => requested.has(key)) : eligible;
}

function baselineAfterReview(
  previousSnapshot: NewSpecialsSnapshot | null,
  currentSnapshot: NewSpecialsSnapshot,
  reviewedDealKeys: readonly string[],
): NewSpecialsSnapshot {
  const deals = { ...(previousSnapshot?.deals ?? {}) };
  for (const key of reviewedDealKeys) {
    const currentDeal = currentSnapshot.deals[key];
    if (currentDeal) deals[key] = currentDeal;
  }
  return { version: currentSnapshot.version, deals };
}

export function NewSpecialsProvider({ children }: { children: ReactNode }) {
  const { products, loadingProducts, cataloguePublicationKey, cataloguePublicationComplete } = useSearch();
  const { user, loading: authLoading, isAnonymousSession } = useAuth();
  const scope = authLoading ? null : getNewSpecialsStorageScope(user?.id, isAnonymousSession);
  const [stored, setStored] = useState<StoredNewSpecialsState>({ scope: null, snapshot: null, pending: null });
  const [openRequested, setOpenRequested] = useState(false);
  const lastProcessedPublicationRef = useRef<string | null>(null);
  const [sessionPresentedBatchId, setSessionPresentedBatchId] = useState<string | null>(null);

  /* These effects hydrate and reconcile the localStorage-backed external
   * batch store. The state writes are the subscription bridge for that store,
   * rather than derived UI state that could be calculated during render. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!scope) return;
    lastProcessedPublicationRef.current = null;
    setSessionPresentedBatchId(null);
    setStored({
      scope,
      snapshot: readNewSpecialsSnapshot(scope),
      pending: readNewSpecialsPending(scope),
    });
    setOpenRequested(false);
  }, [scope]);

  const storageReady = scope !== null && stored.scope === scope;
  const previousSnapshot = storageReady ? stored.snapshot : null;
  const pending = storageReady ? stored.pending : null;
  const activePending = pending && isNewSpecialsPendingActive(pending) ? pending : null;
  const currentSnapshot = useMemo(() => createNewSpecialsSnapshot(products), [products]);
  const detectedSummary = useMemo(
    () => (previousSnapshot ? summarizeNewSpecials(products, previousSnapshot) : null),
    [previousSnapshot, products],
  );
  // Only expose a summary once its persisted batch exists. This prevents the
  // launch popup from racing the storage write on a cold load.
  const digest = activePending?.summary ?? null;
  const pendingDigest = activePending?.summary ?? null;

  useEffect(() => {
    if (!scope || !storageReady || loadingProducts || products.length === 0 || !cataloguePublicationKey || !cataloguePublicationComplete) return;
    if (lastProcessedPublicationRef.current === cataloguePublicationKey) return;

    // A stale unread batch should not be resurrected by the same catalogue
    // snapshot. Advance the baseline and wait for a genuinely newer
    // publication before showing another badge or popup.
    if (pending && !isNewSpecialsPendingActive(pending)) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        setStored({ scope, snapshot: currentSnapshot, pending: null });
      }
      return;
    }

    if (!previousSnapshot) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        setStored({ scope, snapshot: currentSnapshot, pending: null });
      }
      return;
    }

    if (!detectedSummary || detectedSummary.total === 0) {
      const snapshotChanged = snapshotFingerprint(previousSnapshot) !== snapshotFingerprint(currentSnapshot);
      if (!snapshotChanged && !pending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        return;
      }
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        setStored({ scope, snapshot: currentSnapshot, pending: null });
      }
      return;
    }

    const nextPending = pending
      ? { ...pending, summary: detectedSummary, snapshot: currentSnapshot }
      : createNewSpecialsPending(detectedSummary, currentSnapshot);
    const pendingUnchanged = pending
      && summaryFingerprint(pending.summary) === summaryFingerprint(detectedSummary)
      && snapshotFingerprint(pending.snapshot) === snapshotFingerprint(currentSnapshot);
    if (pendingUnchanged) {
      lastProcessedPublicationRef.current = cataloguePublicationKey;
      return;
    }

    if (writeNewSpecialsPending(nextPending, scope)) {
      lastProcessedPublicationRef.current = cataloguePublicationKey;
      setStored({ scope, snapshot: previousSnapshot, pending: nextPending });
    }
  }, [cataloguePublicationComplete, cataloguePublicationKey, currentSnapshot, detectedSummary, loadingProducts, pending, previousSnapshot, products.length, scope, storageReady]);

  // Retire an untouched batch while the app remains open too. Relaunches are
  // covered by the reconciliation effect above; this timer keeps the badge
  // honest without requiring another catalogue request.
  useEffect(() => {
    if (!scope || !storageReady || !pending || !isNewSpecialsPendingActive(pending)) return;
    const expiryTimer = window.setTimeout(() => {
      const latestPending = readNewSpecialsPending(scope);
      if (!latestPending || latestPending.batchId !== pending.batchId || isNewSpecialsPendingActive(latestPending)) return;
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) setStored({ scope, snapshot: currentSnapshot, pending: null });
    }, Math.max(0, pending.expiresAt - Date.now()));
    return () => window.clearTimeout(expiryTimer);
  }, [currentSnapshot, pending, scope, storageReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const popupPresented = isNewSpecialsPopupPresented(activePending, sessionPresentedBatchId);

  const requestOpen = useCallback(() => {
    if (pendingDigest?.total && !popupPresented) setOpenRequested(true);
  }, [pendingDigest, popupPresented]);

  const consumeOpenRequest = useCallback(() => {
    setOpenRequested(false);
  }, []);

  const markPopupShown = useCallback(() => {
    if (!scope || !storageReady || !activePending || activePending.popupPresented) return;
    const nextPending = { ...activePending, popupPresented: true };
    // Keep a session-only fallback when storage is unavailable. This does not
    // claim the batch was persisted, but it prevents a route change from
    // repeatedly interrupting the user with the same popup in this session.
    setSessionPresentedBatchId(activePending.batchId);
    writeNewSpecialsPending(nextPending, scope);
    setStored({ scope, snapshot: previousSnapshot, pending: nextPending });
    setOpenRequested(false);
  }, [activePending, previousSnapshot, scope, storageReady]);

  const markReviewed = useCallback((dealKeys?: string[], filter: DealFilter = "all") => {
    if (!scope || !storageReady || !activePending) return;
    const reviewedKeys = filterReviewKeys(activePending.summary, dealKeys, filter);
    if (reviewedKeys.length === 0) return;
    const remainingSummary = removeReviewedNewSpecials(activePending.summary, reviewedKeys);
    if (!remainingSummary) {
      const snapshotToKeep = activePending.snapshot ?? currentSnapshot;
      const wroteSnapshot = writeNewSpecialsSnapshot(snapshotToKeep, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) setStored({ scope, snapshot: snapshotToKeep, pending: null });
      setOpenRequested(false);
      return;
    }

    const nextBaseline = baselineAfterReview(previousSnapshot, activePending.snapshot, reviewedKeys);
    const nextPending = { ...activePending, summary: remainingSummary, popupPresented: true };
    const wroteBaseline = writeNewSpecialsSnapshot(nextBaseline, scope);
    const wrotePending = wroteBaseline && writeNewSpecialsPending(nextPending, scope);
    if (wrotePending) setStored({ scope, snapshot: nextBaseline, pending: nextPending });
    setOpenRequested(false);
  }, [activePending, currentSnapshot, previousSnapshot, scope, storageReady]);

  const value = useMemo<NewSpecialsContextValue>(
    () => ({
      digest,
      hasPendingDigest: Boolean(pendingDigest?.total),
      popupPresented,
      openRequested,
      requestOpen,
      consumeOpenRequest,
      markPopupShown,
      markReviewed,
    }),
    [consumeOpenRequest, digest, markPopupShown, markReviewed, openRequested, pendingDigest, popupPresented, requestOpen],
  );

  return <NewSpecialsContext.Provider value={value}>{children}</NewSpecialsContext.Provider>;
}

export function useNewSpecials(): NewSpecialsContextValue {
  const context = useContext(NewSpecialsContext);
  if (!context) throw new Error("useNewSpecials must be used inside NewSpecialsProvider");
  return context;
}

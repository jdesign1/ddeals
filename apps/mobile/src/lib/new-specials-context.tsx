"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-context";
import { useSearch } from "./search-context";
import {
  clearNewSpecialsPending,
  createNewSpecialsPending,
  createNewSpecialsSnapshot,
  canShowNewSpecialsPopup,
  getNewSpecialsStorageScope,
  getNewSpecialsSummaryFingerprint,
  isNewSpecialsPendingActive,
  NEW_SPECIALS_POPUP_STATE_VERSION,
  NEW_SPECIALS_POPUP_SUPPRESS_EVENT,
  createNewSpecialsPopupState,
  readNewSpecialsPending,
  readNewSpecialsPopupState,
  readNewSpecialsSnapshot,
  removeReviewedNewSpecials,
  summarizeNewSpecials,
  writeNewSpecialsPending,
  writeNewSpecialsPopupState,
  writeNewSpecialsSnapshot,
  type NewSpecialsPending,
  type NewSpecialsPopupState,
  type NewSpecialsSnapshot,
  type NewSpecialsSummary,
} from "./new-specials";
import type { DealFilter } from "./deal-filters";

interface NewSpecialsContextValue {
  digest: NewSpecialsSummary | null;
  hasPendingDigest: boolean;
  popupEligible: boolean;
  popupSuppressedUntilHomeExit: boolean;
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
  popupState: NewSpecialsPopupState | null;
}

const NewSpecialsContext = createContext<NewSpecialsContextValue | null>(null);

function snapshotFingerprint(snapshot: NewSpecialsSnapshot): string {
  return JSON.stringify(snapshot.deals);
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
  const pathname = usePathname();
  const { products, loadingProducts, cataloguePublicationKey, cataloguePublicationComplete } = useSearch();
  const { user, loading: authLoading, isAnonymousSession } = useAuth();
  const scope = authLoading ? null : getNewSpecialsStorageScope(user?.id, isAnonymousSession);
  const [stored, setStored] = useState<StoredNewSpecialsState>({ scope: null, snapshot: null, pending: null, popupState: null });
  const [openRequested, setOpenRequested] = useState(false);
  const lastProcessedPublicationRef = useRef<string | null>(null);
  const [sessionPopupState, setSessionPopupState] = useState<NewSpecialsPopupState | null>(null);
  const [popupSuppressedUntilHomeExit, setPopupSuppressedUntilHomeExit] = useState(false);
  const suppressionReachedHomeRef = useRef(false);

  /* These effects hydrate and reconcile the localStorage-backed external
   * batch store. The state writes are the subscription bridge for that store,
   * rather than derived UI state that could be calculated during render. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!scope) return;
    lastProcessedPublicationRef.current = null;
    setSessionPopupState(null);
    const hydratedPending = readNewSpecialsPending(scope);
    let hydratedPopupState = readNewSpecialsPopupState(scope);
    // Migrate the old per-batch flag conservatively. The old implementation
    // did not store the exact presentation time, so the batch detection time
    // is the safest boundary for the first cooldown after upgrading.
    if (!hydratedPopupState && hydratedPending?.popupPresented) {
      hydratedPopupState = createNewSpecialsPopupState(hydratedPending.summary, hydratedPending.detectedAt);
      writeNewSpecialsPopupState(hydratedPopupState, scope);
    }
    setStored({
      scope,
      snapshot: readNewSpecialsSnapshot(scope),
      pending: hydratedPending,
      popupState: hydratedPopupState,
    });
    setOpenRequested(false);
  }, [scope]);

  useEffect(() => {
    const suppressPopup = () => {
      suppressionReachedHomeRef.current = false;
      setPopupSuppressedUntilHomeExit(true);
    };
    window.addEventListener(NEW_SPECIALS_POPUP_SUPPRESS_EVENT, suppressPopup);
    return () => window.removeEventListener(NEW_SPECIALS_POPUP_SUPPRESS_EVENT, suppressPopup);
  }, []);

  useEffect(() => {
    if (!popupSuppressedUntilHomeExit) return;
    if (pathname === "/") {
      suppressionReachedHomeRef.current = true;
      return;
    }
    if (suppressionReachedHomeRef.current) {
      suppressionReachedHomeRef.current = false;
      setPopupSuppressedUntilHomeExit(false);
    }
  }, [pathname, popupSuppressedUntilHomeExit]);

  const storageReady = scope !== null && stored.scope === scope;
  const previousSnapshot = storageReady ? stored.snapshot : null;
  const pending = storageReady ? stored.pending : null;
  const persistedPopupState = storageReady ? stored.popupState : null;
  const activePending = pending && isNewSpecialsPendingActive(pending) ? pending : null;
  const popupState = sessionPopupState && (
    !persistedPopupState
    || (sessionPopupState.lastShownAt ?? -1) >= (persistedPopupState.lastShownAt ?? -1)
  ) ? sessionPopupState : persistedPopupState;
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
        setStored({ scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState });
      }
      return;
    }

    if (!previousSnapshot) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        setStored({ scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState });
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
        setStored({ scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState });
      }
      return;
    }

    const nextPending = pending
      ? { ...pending, summary: detectedSummary, snapshot: currentSnapshot }
      : createNewSpecialsPending(detectedSummary, currentSnapshot);
    const pendingUnchanged = pending
      && getNewSpecialsSummaryFingerprint(pending.summary) === getNewSpecialsSummaryFingerprint(detectedSummary)
      && snapshotFingerprint(pending.snapshot) === snapshotFingerprint(currentSnapshot);
    if (pendingUnchanged) {
      lastProcessedPublicationRef.current = cataloguePublicationKey;
      return;
    }

    if (writeNewSpecialsPending(nextPending, scope)) {
      lastProcessedPublicationRef.current = cataloguePublicationKey;
      setStored({ scope, snapshot: previousSnapshot, pending: nextPending, popupState: persistedPopupState });
    }
  }, [cataloguePublicationComplete, cataloguePublicationKey, currentSnapshot, detectedSummary, loadingProducts, pending, persistedPopupState, previousSnapshot, products.length, scope, storageReady]);

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
      if (wroteSnapshot && clearedPending) setStored({ scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState });
    }, Math.max(0, pending.expiresAt - Date.now()));
    return () => window.clearTimeout(expiryTimer);
  }, [currentSnapshot, pending, persistedPopupState, scope, storageReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const popupEligible = Boolean(
    activePending
    && canShowNewSpecialsPopup(activePending.summary, popupState),
  );

  const requestOpen = useCallback(() => {
    if (!popupSuppressedUntilHomeExit && pendingDigest?.total && popupEligible) setOpenRequested(true);
  }, [pendingDigest, popupEligible, popupSuppressedUntilHomeExit]);

  const consumeOpenRequest = useCallback(() => {
    setOpenRequested(false);
  }, []);

  const markPopupShown = useCallback(() => {
    if (!scope || !storageReady || !activePending) return;
    const nextPending = { ...activePending, popupPresented: true };
    const nextPopupState = createNewSpecialsPopupState(activePending.summary);
    const wrotePending = writeNewSpecialsPending(nextPending, scope);
    const wrotePopupState = writeNewSpecialsPopupState(nextPopupState, scope);
    // Keep a session-only fallback when storage is unavailable. This does not
    // claim the cooldown was persisted, but it prevents repeated interruption
    // during the current session.
    setSessionPopupState(nextPopupState);
    setStored({
      scope,
      snapshot: previousSnapshot,
      pending: wrotePending ? nextPending : activePending,
      popupState: wrotePopupState ? nextPopupState : persistedPopupState,
    });
    setOpenRequested(false);
  }, [activePending, persistedPopupState, previousSnapshot, scope, storageReady]);

  const markReviewed = useCallback((dealKeys?: string[], filter: DealFilter = "all") => {
    if (!scope || !storageReady || !activePending) return;
    const reviewedKeys = filterReviewKeys(activePending.summary, dealKeys, filter);
    if (reviewedKeys.length === 0) return;
    const remainingSummary = removeReviewedNewSpecials(activePending.summary, reviewedKeys);
    if (!remainingSummary) {
      const snapshotToKeep = activePending.snapshot ?? currentSnapshot;
      const wroteSnapshot = writeNewSpecialsSnapshot(snapshotToKeep, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        setStored({ scope, snapshot: snapshotToKeep, pending: null, popupState: persistedPopupState });
      }
      setOpenRequested(false);
      return;
    }

    const nextBaseline = baselineAfterReview(previousSnapshot, activePending.snapshot, reviewedKeys);
    const nextPending = { ...activePending, summary: remainingSummary, popupPresented: true };
    const nextPopupState: NewSpecialsPopupState = popupState
      ? { ...popupState, lastShownFingerprint: getNewSpecialsSummaryFingerprint(remainingSummary) }
      : {
          version: NEW_SPECIALS_POPUP_STATE_VERSION,
          lastShownAt: null,
          lastShownFingerprint: getNewSpecialsSummaryFingerprint(remainingSummary),
        };
    const wroteBaseline = writeNewSpecialsSnapshot(nextBaseline, scope);
    const wrotePending = wroteBaseline && writeNewSpecialsPending(nextPending, scope);
    if (wrotePending) {
      const wrotePopupState = writeNewSpecialsPopupState(nextPopupState, scope);
      setSessionPopupState(nextPopupState);
      setStored({
        scope,
        snapshot: nextBaseline,
        pending: nextPending,
        popupState: wrotePopupState ? nextPopupState : persistedPopupState,
      });
    }
    setOpenRequested(false);
  }, [activePending, currentSnapshot, persistedPopupState, popupState, previousSnapshot, scope, storageReady]);

  const value = useMemo<NewSpecialsContextValue>(
    () => ({
      digest,
      hasPendingDigest: Boolean(pendingDigest?.total),
      popupEligible,
      popupSuppressedUntilHomeExit,
      openRequested,
      requestOpen,
      consumeOpenRequest,
      markPopupShown,
      markReviewed,
    }),
    [consumeOpenRequest, digest, markPopupShown, markReviewed, openRequested, pendingDigest, popupEligible, popupSuppressedUntilHomeExit, requestOpen],
  );

  return <NewSpecialsContext.Provider value={value}>{children}</NewSpecialsContext.Provider>;
}

export function useNewSpecials(): NewSpecialsContextValue {
  const context = useContext(NewSpecialsContext);
  if (!context) throw new Error("useNewSpecials must be used inside NewSpecialsProvider");
  return context;
}

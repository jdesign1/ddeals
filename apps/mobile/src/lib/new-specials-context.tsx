"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-context";
import { useSearch } from "./search-context";
import {
  buildDealDetectiveQuizCase,
  clearStoredDealDetectiveCase,
  clearStoredDealDetectivePlayedState,
  createStoredDealDetectiveCase,
  readStoredDealDetectiveCase,
  readStoredDealDetectivePlayedState,
  writeStoredDealDetectiveCase,
  writeStoredDealDetectivePlayedState,
  type DealDetectiveQuizCase,
  type DealDetectiveQuestionKind,
  type StoredDealDetectiveCase,
} from "./deal-detective-quiz";
import {
  clearNewSpecialsPending,
  createNewSpecialsPending,
  createNewSpecialsSnapshot,
  canShowNewSpecialsPopup,
  getNewSpecialDealKey,
  getNewSpecialsStorageScope,
  getNewSpecialsSummaryFingerprint,
  isNewSpecialsPendingActive,
  NEW_SPECIALS_PENDING_TTL_MS,
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
  detectiveCase: DealDetectiveQuizCase | null;
  hasUnplayedDetectiveCase: boolean;
  canOpenDetectiveCase: boolean;
  hasPendingDigest: boolean;
  popupEligible: boolean;
  popupSuppressedUntilHomeExit: boolean;
  openRequested: boolean;
  detectiveCaseOpenRequested: boolean;
  requestOpen: () => void;
  requestDetectiveCaseOpen: () => void;
  consumeOpenRequest: () => void;
  consumeDetectiveCaseOpenRequest: () => void;
  markPopupShown: () => void;
  markDetectiveCasePlayed: () => void;
  markReviewed: (dealKeys?: string[], filter?: DealFilter) => void;
}

interface StoredNewSpecialsState {
  scope: string | null;
  snapshot: NewSpecialsSnapshot | null;
  pending: NewSpecialsPending | null;
  popupState: NewSpecialsPopupState | null;
  detectiveCase: StoredDealDetectiveCase | null;
  detectiveCasePlayedPublicationKey: string | null;
  detectiveCasePlayedQuestionKind: DealDetectiveQuestionKind | null;
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

function alternateQuestionKind(kind: DealDetectiveQuestionKind): DealDetectiveQuestionKind {
  return kind === "real" ? "dodgy" : "real";
}

export function NewSpecialsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { products, loadingProducts, cataloguePublicationKey, cataloguePublicationComplete } = useSearch();
  const { user, profile, loading: authLoading, isAnonymousSession } = useAuth();
  const scope = authLoading ? null : getNewSpecialsStorageScope(user?.id, isAnonymousSession);
  const [stored, setStored] = useState<StoredNewSpecialsState>({ scope: null, snapshot: null, pending: null, popupState: null, detectiveCase: null, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null });
  const [openRequested, setOpenRequested] = useState(false);
  const [detectiveCaseOpenRequested, setDetectiveCaseOpenRequested] = useState(false);
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
    const hydratedPlayedState = readStoredDealDetectivePlayedState(scope);
    setStored({
      scope,
      snapshot: readNewSpecialsSnapshot(scope),
      pending: hydratedPending,
      popupState: hydratedPopupState,
      detectiveCase: readStoredDealDetectiveCase(scope),
      detectiveCasePlayedPublicationKey: hydratedPlayedState?.publicationKey ?? null,
      detectiveCasePlayedQuestionKind: hydratedPlayedState?.questionKind ?? null,
    });
    setOpenRequested(false);
    setDetectiveCaseOpenRequested(false);
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
  const storedDetectiveCase = storageReady && stored.detectiveCase && stored.detectiveCase.expiresAt > Date.now()
    ? stored.detectiveCase
    : null;
  const detectiveCasePlayedPublicationKey = storageReady ? stored.detectiveCasePlayedPublicationKey : null;
  const detectiveCasePlayedQuestionKind = storageReady ? stored.detectiveCasePlayedQuestionKind : null;
  const detectiveCase = storedDetectiveCase?.quizCase ?? null;
  // The profile-menu game can use the current catalogue when there is no
  // unread new-specials batch. This keeps the game discoverable for returning
  // users without making the automatic new-deals popup reappear.
  const catalogueCaseSummary = useMemo(() => {
    const realDealKeys: string[] = [];
    const dodgyDealKeys: string[] = [];
    for (const product of products) {
      for (const deal of product.currentDeals) {
        if (!deal.isOnSpecial) continue;
        const dealKey = getNewSpecialDealKey(product.id, deal.store);
        if (deal.dealType === "Real Deal") realDealKeys.push(dealKey);
        if (deal.dealType === "Dodgy Deal") dodgyDealKeys.push(dealKey);
      }
    }
    return { realDealKeys, dodgyDealKeys };
  }, [products]);
  const currentQuizCase = useMemo(() => {
    const summaries = [
      detectedSummary?.total ? detectedSummary : activePending?.summary,
      catalogueCaseSummary,
    ].filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
    for (const summary of summaries) {
      const quizCase = buildDealDetectiveQuizCase(products, summary, profile?.preferred_categories ?? []);
      if (quizCase) return quizCase;
    }
    return null;
  }, [activePending, catalogueCaseSummary, detectedSummary, products, profile?.preferred_categories]);

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
        setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
      }
      return;
    }

    if (!previousSnapshot) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        lastProcessedPublicationRef.current = cataloguePublicationKey;
        setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
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
        setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
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
      setStored((current) => ({ ...current, scope, snapshot: previousSnapshot, pending: nextPending, popupState: persistedPopupState }));
    }
  }, [cataloguePublicationComplete, cataloguePublicationKey, currentSnapshot, detectedSummary, loadingProducts, pending, persistedPopupState, previousSnapshot, products.length, scope, storageReady]);

  // The detective case is intentionally separate from the unread-deals batch.
  // Reviewing or dismissing the batch must not make an unanswered case
  // disappear, while a genuinely newer publication must replace the old case.
  useEffect(() => {
    if (!scope || !storageReady || !cataloguePublicationKey || !cataloguePublicationComplete) return;
    const hasNewPublication = Boolean(detectedSummary?.total);
    const canReplayForTest = isAnonymousSession && !storedDetectiveCase;
    if (detectiveCasePlayedPublicationKey === cataloguePublicationKey && !canReplayForTest) {
      if (storedDetectiveCase) {
        clearStoredDealDetectiveCase(scope);
        setStored((current) => ({ ...current, detectiveCase: null }));
      }
      return;
    }
    if (hasNewPublication && storedDetectiveCase?.publicationKey !== cataloguePublicationKey && !currentQuizCase) {
      clearStoredDealDetectiveCase(scope);
      setStored((current) => ({ ...current, detectiveCase: null }));
      return;
    }
    if (!currentQuizCase) return;
    if (!hasNewPublication && storedDetectiveCase) return;
    if (storedDetectiveCase?.publicationKey === cataloguePublicationKey) return;

    const previousQuestionKind = storedDetectiveCase?.quizCase.questionKind ?? detectiveCasePlayedQuestionKind;
    const questionKind = previousQuestionKind ? alternateQuestionKind(previousQuestionKind) : "real";

    const nextCase = createStoredDealDetectiveCase(
      cataloguePublicationKey,
      currentQuizCase,
      hasNewPublication
        ? Date.now() + NEW_SPECIALS_PENDING_TTL_MS
        : activePending?.expiresAt ?? Date.now() + NEW_SPECIALS_PENDING_TTL_MS,
      questionKind,
    );
    if (writeStoredDealDetectiveCase(nextCase, scope)) {
      clearStoredDealDetectivePlayedState(scope);
      setStored((current) => ({ ...current, detectiveCase: nextCase, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null }));
    }
  }, [activePending, cataloguePublicationComplete, cataloguePublicationKey, currentQuizCase, detectedSummary, detectiveCasePlayedPublicationKey, detectiveCasePlayedQuestionKind, isAnonymousSession, scope, storageReady, storedDetectiveCase]);

  useEffect(() => {
    if (!scope || !storageReady || !stored.detectiveCase) return;
    const remainingMs = stored.detectiveCase.expiresAt - Date.now();
    if (remainingMs <= 0) {
      clearStoredDealDetectiveCase(scope);
      setStored((current) => ({ ...current, detectiveCase: null }));
      return;
    }
    const expiryTimer = window.setTimeout(() => {
      clearStoredDealDetectiveCase(scope);
      setStored((current) => ({ ...current, detectiveCase: null }));
    }, remainingMs);
    return () => window.clearTimeout(expiryTimer);
  }, [scope, storageReady, stored.detectiveCase]);

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
      if (wroteSnapshot && clearedPending) setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
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

  // A valid case can be recovered from the current catalogue even when an
  // earlier render missed the localStorage write. Do not recreate a case that
  // this account has already answered for the current publication.
  const detectiveCasePlayedForCurrentPublication = Boolean(
    cataloguePublicationKey && detectiveCasePlayedPublicationKey === cataloguePublicationKey,
  );
  const canCreateDetectiveCaseOnDemand = Boolean(currentQuizCase && storageReady && !detectiveCasePlayedForCurrentPublication);
  const canOpenDetectiveCase = Boolean(detectiveCase || canCreateDetectiveCaseOnDemand);

  const requestDetectiveCaseOpen = useCallback(() => {
    if (detectiveCase) {
      setDetectiveCaseOpenRequested(true);
      return;
    }
    if (!currentQuizCase || !scope || !storageReady || detectiveCasePlayedForCurrentPublication) return;

    // The normal reconciliation effect persists a case as soon as the
    // catalogue marker is ready. This on-demand path covers a cold profile
    // menu tap before that marker has arrived, and recovers cases from older
    // builds that left no case in localStorage.
    const nextCase = createStoredDealDetectiveCase(
      cataloguePublicationKey ?? "anonymous-test-case",
      currentQuizCase,
      Date.now() + NEW_SPECIALS_PENDING_TTL_MS,
      detectiveCasePlayedQuestionKind ? alternateQuestionKind(detectiveCasePlayedQuestionKind) : "real",
    );
    if (!writeStoredDealDetectiveCase(nextCase, scope)) return;
    clearStoredDealDetectivePlayedState(scope);
    setStored((current) => ({ ...current, detectiveCase: nextCase, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null }));
    setDetectiveCaseOpenRequested(true);
  }, [cataloguePublicationKey, currentQuizCase, detectiveCase, detectiveCasePlayedForCurrentPublication, detectiveCasePlayedQuestionKind, scope, storageReady]);

  const consumeOpenRequest = useCallback(() => {
    setOpenRequested(false);
  }, []);

  const consumeDetectiveCaseOpenRequest = useCallback(() => {
    setDetectiveCaseOpenRequested(false);
  }, []);

  const markDetectiveCasePlayed = useCallback(() => {
    if (!scope || !storageReady || !storedDetectiveCase) return;
    // Anonymous Test mode intentionally keeps the case available so it can be
    // replayed while the interaction is being QA-tested. Real accounts still
    // consume the case permanently after the first answer.
    if (isAnonymousSession) {
      setDetectiveCaseOpenRequested(false);
      return;
    }
    const playedPublicationKey = storedDetectiveCase.publicationKey;
    const playedQuestionKind = storedDetectiveCase.quizCase.questionKind ?? "real";
    writeStoredDealDetectivePlayedState(playedPublicationKey, playedQuestionKind, scope);
    clearStoredDealDetectiveCase(scope);
    setStored((current) => ({ ...current, detectiveCase: null, detectiveCasePlayedPublicationKey: playedPublicationKey, detectiveCasePlayedQuestionKind: playedQuestionKind }));
    setDetectiveCaseOpenRequested(false);
  }, [isAnonymousSession, scope, storageReady, storedDetectiveCase]);

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
    setStored((current) => ({
      ...current,
      scope,
      snapshot: previousSnapshot,
      pending: wrotePending ? nextPending : activePending,
      popupState: wrotePopupState ? nextPopupState : persistedPopupState,
    }));
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
        setStored((current) => ({ ...current, scope, snapshot: snapshotToKeep, pending: null, popupState: persistedPopupState }));
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
      setStored((current) => ({
        ...current,
        scope,
        snapshot: nextBaseline,
        pending: nextPending,
        popupState: wrotePopupState ? nextPopupState : persistedPopupState,
      }));
    }
    setOpenRequested(false);
  }, [activePending, currentSnapshot, persistedPopupState, popupState, previousSnapshot, scope, storageReady]);

  const value = useMemo<NewSpecialsContextValue>(
    () => ({
      digest,
      detectiveCase,
      hasUnplayedDetectiveCase: Boolean(detectiveCase),
      canOpenDetectiveCase,
      hasPendingDigest: Boolean(pendingDigest?.total),
      popupEligible,
      popupSuppressedUntilHomeExit,
      openRequested,
      detectiveCaseOpenRequested,
      requestOpen,
      requestDetectiveCaseOpen,
      consumeOpenRequest,
      consumeDetectiveCaseOpenRequest,
      markPopupShown,
      markReviewed,
      markDetectiveCasePlayed,
    }),
    [canOpenDetectiveCase, consumeDetectiveCaseOpenRequest, consumeOpenRequest, detectiveCase, detectiveCaseOpenRequested, digest, markDetectiveCasePlayed, markPopupShown, markReviewed, openRequested, pendingDigest, popupEligible, popupSuppressedUntilHomeExit, requestDetectiveCaseOpen, requestOpen],
  );

  return <NewSpecialsContext.Provider value={value}>{children}</NewSpecialsContext.Provider>;
}

export function useNewSpecials(): NewSpecialsContextValue {
  const context = useContext(NewSpecialsContext);
  if (!context) throw new Error("useNewSpecials must be used inside NewSpecialsProvider");
  return context;
}

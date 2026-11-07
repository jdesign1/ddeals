"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuthStatus } from "./auth-context";
import { useSearchCatalogue } from "./search-context";
import { useSubscriptionStatus } from "./subscription-context";
import {
  buildDealDetectiveQuizCase,
  clearStoredDealDetectiveCase,
  clearStoredDealDetectivePlayedState,
  createStoredDealDetectiveCase,
  dealDetectivePairKeyForCase,
  loadStoredDealDetectivePairKeys,
  nextDealDetectiveCaseNumber,
  readStoredDealDetectiveCase,
  readStoredDealDetectivePairKeys,
  readStoredDealDetectivePlayedState,
  writeStoredDealDetectiveCase,
  writeStoredDealDetectivePairKeys,
  writeStoredDealDetectivePlayedState,
  type DealDetectiveQuizCase,
  type DealDetectiveQuestionKind,
  type StoredDealDetectiveCase,
} from "./deal-detective-quiz";
import {
  clearNewSpecialsPending,
  createNewSpecialsPending,
  createNewSpecialsSnapshot,
  createNewSpecialsPreviewSummary,
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
  previewSummary: NewSpecialsSummary;
  previewOpenRequested: boolean;
  detectiveCaseOpenRequested: boolean;
  requestOpen: () => void;
  requestPreviewOpen: () => void;
  requestDetectiveCaseOpen: () => void;
  consumeOpenRequest: () => void;
  consumePreviewOpenRequest: () => void;
  consumeDetectiveCaseOpenRequest: () => void;
  markPopupShown: () => void;
  markDetectiveCasePlayed: () => void;
  markReviewed: (dealKeys?: string[], filter?: DealFilter) => void;
}

export type NewSpecialsDataContextValue = Pick<
  NewSpecialsContextValue,
  | "digest"
  | "detectiveCase"
  | "hasUnplayedDetectiveCase"
  | "canOpenDetectiveCase"
  | "hasPendingDigest"
  | "popupEligible"
  | "popupSuppressedUntilHomeExit"
  | "openRequested"
  | "previewSummary"
  | "previewOpenRequested"
  | "detectiveCaseOpenRequested"
>;

export type NewSpecialsActionsContextValue = Pick<
  NewSpecialsContextValue,
  | "requestOpen"
  | "requestPreviewOpen"
  | "requestDetectiveCaseOpen"
  | "consumeOpenRequest"
  | "consumePreviewOpenRequest"
  | "consumeDetectiveCaseOpenRequest"
  | "markPopupShown"
  | "markDetectiveCasePlayed"
  | "markReviewed"
>;

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
const NewSpecialsDataContext = createContext<NewSpecialsDataContextValue | null>(null);
const NewSpecialsActionsContext = createContext<NewSpecialsActionsContextValue | null>(null);
const EMPTY_PREVIEW_SUMMARY: NewSpecialsSummary = {
  byStore: { woolworths: 0, newworld: 0, paknsave: 0, foursquare: 0 },
  realDeals: 0,
  dodgyDeals: 0,
  total: 0,
  newlyStarted: 0,
  priceDrops: 0,
  allDealKeys: [],
  realDealKeys: [],
  dodgyDealKeys: [],
  newlyStartedDealKeys: [],
  priceDropDealKeys: [],
};
const EMPTY_CATALOGUE_CASE_SUMMARY = { realDealKeys: [], dodgyDealKeys: [] };

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
  const { products, loadingProducts, cataloguePublicationKey, cataloguePublicationComplete } = useSearchCatalogue();
  const latestProductsRef = useRef(products);
  const { user, profile, loading: authLoading, isAnonymousSession, session } = useAuthStatus();
  const { isPremium, loading: subscriptionLoading } = useSubscriptionStatus();
  const detectiveAccessToken = session?.access_token ?? null;
  const scope = authLoading ? null : getNewSpecialsStorageScope(user?.id, isAnonymousSession);
  const [stored, setStored] = useState<StoredNewSpecialsState>({ scope: null, snapshot: null, pending: null, popupState: null, detectiveCase: null, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null });
  const [playedPairKeys, setPlayedPairKeys] = useState<string[]>([]);
  const [playedPairHistoryReady, setPlayedPairHistoryReady] = useState(false);
  const [now] = useState(() => Date.now());
  const [openRequested, setOpenRequested] = useState(false);
  const [previewOpenRequested, setPreviewOpenRequested] = useState(false);
  const [detectiveCaseOpenRequested, setDetectiveCaseOpenRequested] = useState(false);
  const [lastProcessedPublicationKey, setLastProcessedPublicationKey] = useState<string | null>(null);
  const [sessionPopupState, setSessionPopupState] = useState<NewSpecialsPopupState | null>(null);
  const [popupSuppressedUntilHomeExit, setPopupSuppressedUntilHomeExit] = useState(false);
  const suppressionReachedHomeRef = useRef(false);

  useEffect(() => {
    latestProductsRef.current = products;
  }, [products]);

  /* These effects hydrate and reconcile the localStorage-backed external
   * batch store. The state writes are the subscription bridge for that store,
   * rather than derived UI state that could be calculated during render. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!scope) return;
    setLastProcessedPublicationKey(null);
    setSessionPopupState(null);
    const hydratedPending = readNewSpecialsPending(scope);
    let hydratedPopupState = readNewSpecialsPopupState(scope);
    // Migrate the old per-batch flag conservatively. The old implementation
    // did not store the exact presentation time, so the batch detection time
    // is the safest timestamp to retain for the migrated presentation state.
    if (!hydratedPopupState && hydratedPending?.popupPresented) {
      hydratedPopupState = createNewSpecialsPopupState(hydratedPending.summary, null, hydratedPending.detectedAt);
      writeNewSpecialsPopupState(hydratedPopupState, scope);
    }
    const hydratedPlayedState = readStoredDealDetectivePlayedState(scope);
    const hydratedPairKeys = readStoredDealDetectivePairKeys(scope);
    let hydratedDetectiveCase = readStoredDealDetectiveCase(scope);
    // Older stored cases predate the shopper-facing case number. Assign one
    // once during hydration so the next profile replay continues the sequence.
    if (hydratedDetectiveCase && !hydratedDetectiveCase.quizCase.caseNumber) {
      hydratedDetectiveCase = {
        ...hydratedDetectiveCase,
        quizCase: {
          ...hydratedDetectiveCase.quizCase,
          caseNumber: nextDealDetectiveCaseNumber(scope),
        },
      };
      writeStoredDealDetectiveCase(hydratedDetectiveCase, scope);
    }
    setStored({
      scope,
      snapshot: readNewSpecialsSnapshot(scope),
      pending: hydratedPending,
      popupState: hydratedPopupState,
      detectiveCase: hydratedDetectiveCase,
      detectiveCasePlayedPublicationKey: hydratedPlayedState?.publicationKey ?? null,
      detectiveCasePlayedQuestionKind: hydratedPlayedState?.questionKind ?? null,
    });
    setPlayedPairKeys(hydratedPairKeys);
    setPlayedPairHistoryReady(isAnonymousSession);
    setOpenRequested(false);
    setPreviewOpenRequested(false);
    setDetectiveCaseOpenRequested(false);
  }, [isAnonymousSession, scope]);

  const storageReady = scope !== null && stored.scope === scope;

  useEffect(() => {
    if (!scope || !storageReady) return;
    if (isAnonymousSession || !detectiveAccessToken) {
      setPlayedPairHistoryReady(true);
      return;
    }
    const controller = new AbortController();
    setPlayedPairHistoryReady(false);
    loadStoredDealDetectivePairKeys(detectiveAccessToken, controller.signal)
      .then((remotePairKeys) => {
        setPlayedPairKeys((currentPairKeys) => {
          const mergedPairKeys = [...new Set([...currentPairKeys, ...remotePairKeys])];
          writeStoredDealDetectivePairKeys(mergedPairKeys, scope);
          return mergedPairKeys;
        });
        setPlayedPairHistoryReady(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Local history remains a safe fallback if the optional history read is
        // temporarily unavailable; the scoring RPC still rejects duplicates.
        setPlayedPairHistoryReady(true);
      });
    return () => controller.abort();
  }, [detectiveAccessToken, isAnonymousSession, scope, storageReady]);

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

  const previousSnapshot = storageReady ? stored.snapshot : null;
  const pending = storageReady ? stored.pending : null;
  const persistedPopupState = storageReady ? stored.popupState : null;
  const activePending = pending && isNewSpecialsPendingActive(pending) ? pending : null;
  const popupState = sessionPopupState && (
    !persistedPopupState
    || (sessionPopupState.lastShownAt ?? -1) >= (persistedPopupState.lastShownAt ?? -1)
  ) ? sessionPopupState : persistedPopupState;
  const detectedSummary = useMemo(
    () => {
      if (!previousSnapshot) return null;
      // Once a publication has been reconciled, later local expiry/detail
      // updates cannot create another batch for that same publication. Avoid
      // rescanning the full catalogue until the publication marker advances.
      if (
        cataloguePublicationComplete
        && cataloguePublicationKey
        && lastProcessedPublicationKey === cataloguePublicationKey
      ) return null;
      return summarizeNewSpecials(products, previousSnapshot);
    },
    [cataloguePublicationComplete, cataloguePublicationKey, lastProcessedPublicationKey, previousSnapshot, products],
  );
  // The preview is opened only after an explicit profile-menu tap. Keep a
  // stable empty value during background catalogue refreshes and build the
  // real summary at that tap instead of scanning the full catalogue globally
  // on every refresh.
  const [previewSummary, setPreviewSummary] = useState<NewSpecialsSummary>(EMPTY_PREVIEW_SUMMARY);
  // Only expose a summary once its persisted batch exists. This prevents the
  // launch popup from racing the storage write on a cold load.
  const digest = activePending?.summary ?? null;
  const pendingDigest = activePending?.summary ?? null;
  const storedDetectiveCase = storageReady && stored.detectiveCase && (now === 0 || stored.detectiveCase.expiresAt > now)
    ? stored.detectiveCase
    : null;
  const detectiveCasePlayedPublicationKey = storageReady ? stored.detectiveCasePlayedPublicationKey : null;
  const detectiveCasePlayedQuestionKind = storageReady ? stored.detectiveCasePlayedQuestionKind : null;
  const detectiveCase = storedDetectiveCase?.quizCase ?? null;
  // The profile-menu game can use the current catalogue when there is no
  // unread new-specials batch. This keeps the game discoverable for returning
  // users without making the automatic new-deals popup reappear.
  const catalogueCaseSummary = useMemo(() => {
    if (!storageReady || !playedPairHistoryReady || products.length === 0) return EMPTY_CATALOGUE_CASE_SUMMARY;
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
  }, [playedPairHistoryReady, products, storageReady]);
  const buildCurrentQuizCase = useCallback((rotationIndex = 0) => {
    const summaries = [
      detectedSummary?.total ? detectedSummary : activePending?.summary,
      catalogueCaseSummary,
    ].filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
    for (const summary of summaries) {
      const quizCase = buildDealDetectiveQuizCase(products, summary, profile?.preferred_categories ?? [], rotationIndex, playedPairKeys);
      if (quizCase) return quizCase;
    }
    return null;
  }, [activePending, catalogueCaseSummary, detectedSummary, playedPairKeys, products, profile?.preferred_categories]);
  const currentQuizCase = useMemo(
    () => (storageReady && playedPairHistoryReady && products.length > 0 ? buildCurrentQuizCase() : null),
    [buildCurrentQuizCase, playedPairHistoryReady, products.length, storageReady],
  );

  useEffect(() => {
    if (!scope || !storageReady || loadingProducts || products.length === 0 || !cataloguePublicationKey || !cataloguePublicationComplete) return;
    if (lastProcessedPublicationKey === cataloguePublicationKey) return;

    // Snapshot creation is only needed when reconciling a new publication.
    // Local expiry/detail updates keep the same publication key and should not
    // rescan every product just to discover that no new batch exists.
    const currentSnapshot = createNewSpecialsSnapshot(products);

    // A stale unread batch should not be resurrected by the same catalogue
    // snapshot. Advance the baseline and wait for a genuinely newer
    // publication before showing another badge or popup.
    if (pending && !isNewSpecialsPendingActive(pending)) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        setLastProcessedPublicationKey(cataloguePublicationKey);
        setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
      }
      return;
    }

    if (!previousSnapshot) {
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        setLastProcessedPublicationKey(cataloguePublicationKey);
        setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
      }
      return;
    }

    if (!detectedSummary || detectedSummary.total === 0) {
      const snapshotChanged = snapshotFingerprint(previousSnapshot) !== snapshotFingerprint(currentSnapshot);
      if (!snapshotChanged && !pending) {
        setLastProcessedPublicationKey(cataloguePublicationKey);
        return;
      }
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) {
        setLastProcessedPublicationKey(cataloguePublicationKey);
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
      setLastProcessedPublicationKey(cataloguePublicationKey);
      return;
    }

    if (writeNewSpecialsPending(nextPending, scope)) {
      setLastProcessedPublicationKey(cataloguePublicationKey);
      setStored((current) => ({ ...current, scope, snapshot: previousSnapshot, pending: nextPending, popupState: persistedPopupState }));
    }
  }, [cataloguePublicationComplete, cataloguePublicationKey, detectedSummary, lastProcessedPublicationKey, loadingProducts, pending, persistedPopupState, previousSnapshot, products, scope, storageReady]);

  // The detective case is intentionally separate from the unread-deals batch.
  // Reviewing or dismissing the batch must not make an unanswered case
  // disappear, while a genuinely newer publication must replace the old case.
  useEffect(() => {
    if (!scope || !storageReady || !cataloguePublicationKey || !cataloguePublicationComplete || !playedPairHistoryReady) return;
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

    const nextCaseNumber = nextDealDetectiveCaseNumber(scope);
    const nextQuizCase = buildCurrentQuizCase(nextCaseNumber - 1);
    if (!nextQuizCase) return;
    const nextCase = createStoredDealDetectiveCase(
      cataloguePublicationKey,
      nextQuizCase,
      hasNewPublication
        ? Date.now() + NEW_SPECIALS_PENDING_TTL_MS
        : activePending?.expiresAt ?? Date.now() + NEW_SPECIALS_PENDING_TTL_MS,
      questionKind,
      nextCaseNumber,
    );
    if (writeStoredDealDetectiveCase(nextCase, scope)) {
      clearStoredDealDetectivePlayedState(scope);
      setStored((current) => ({ ...current, detectiveCase: nextCase, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null }));
    }
  }, [activePending, buildCurrentQuizCase, cataloguePublicationComplete, cataloguePublicationKey, currentQuizCase, detectedSummary, detectiveCasePlayedPublicationKey, detectiveCasePlayedQuestionKind, isAnonymousSession, playedPairHistoryReady, scope, storageReady, storedDetectiveCase]);

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
      const currentSnapshot = createNewSpecialsSnapshot(latestProductsRef.current);
      const wroteSnapshot = writeNewSpecialsSnapshot(currentSnapshot, scope);
      const clearedPending = wroteSnapshot && clearNewSpecialsPending(scope);
      if (wroteSnapshot && clearedPending) setStored((current) => ({ ...current, scope, snapshot: currentSnapshot, pending: null, popupState: persistedPopupState }));
    }, Math.max(0, pending.expiresAt - Date.now()));
    return () => window.clearTimeout(expiryTimer);
  }, [pending, persistedPopupState, scope, storageReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const popupEligible = Boolean(
    activePending
    && canShowNewSpecialsPopup(activePending.summary, popupState, cataloguePublicationKey),
  );

  const requestOpen = useCallback(() => {
    if (!popupSuppressedUntilHomeExit && pendingDigest?.total && popupEligible) setOpenRequested(true);
  }, [pendingDigest, popupEligible, popupSuppressedUntilHomeExit]);

  const requestPreviewOpen = useCallback(() => {
    if (!storageReady || loadingProducts) return;

    setPreviewSummary(createNewSpecialsPreviewSummary(products));

    // The test preview should include the game card even when the normal
    // publication-driven reconciliation has not persisted a case yet.
    if (!detectiveCase && currentQuizCase && playedPairHistoryReady && scope) {
      const nextCaseNumber = nextDealDetectiveCaseNumber(scope);
      const nextQuizCase = buildCurrentQuizCase(nextCaseNumber - 1) ?? currentQuizCase;
      const nextCase = createStoredDealDetectiveCase(
        cataloguePublicationKey ?? "anonymous-test-case",
        nextQuizCase,
        Date.now() + NEW_SPECIALS_PENDING_TTL_MS,
        detectiveCasePlayedQuestionKind ? alternateQuestionKind(detectiveCasePlayedQuestionKind) : "real",
        nextCaseNumber,
      );
      if (writeStoredDealDetectiveCase(nextCase, scope)) {
        clearStoredDealDetectivePlayedState(scope);
        setStored((current) => ({ ...current, detectiveCase: nextCase, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null }));
      }
    }

    setPreviewOpenRequested(true);
  }, [buildCurrentQuizCase, cataloguePublicationKey, currentQuizCase, detectiveCase, detectiveCasePlayedQuestionKind, loadingProducts, playedPairHistoryReady, products, scope, storageReady]);

  // A valid case can be recovered from the current catalogue even when an
  // earlier render missed the localStorage write. Do not recreate a case that
  // this account has already answered for the current publication.
  const detectiveCasePlayedForCurrentPublication = Boolean(
    cataloguePublicationKey && detectiveCasePlayedPublicationKey === cataloguePublicationKey,
  );
  const canCreateDetectiveCaseOnDemand = Boolean(currentQuizCase && playedPairHistoryReady && storageReady && !detectiveCasePlayedForCurrentPublication);
  // Plus accounts retain a profile-menu replay path for QA and support. This
  // does not recreate the automatic launch popup after a case is answered;
  // it only lets the user explicitly start the game again from their profile.
  const canReplayDetectiveCaseFromProfile = Boolean(!subscriptionLoading && isPremium && currentQuizCase && playedPairHistoryReady && storageReady);
  const canOpenDetectiveCase = Boolean(detectiveCase || canCreateDetectiveCaseOnDemand || canReplayDetectiveCaseFromProfile);

  const requestDetectiveCaseOpen = useCallback(() => {
    if (detectiveCase) {
      setDetectiveCaseOpenRequested(true);
      return;
    }
    if (!currentQuizCase || !playedPairHistoryReady || !scope || !storageReady || (detectiveCasePlayedForCurrentPublication && !canReplayDetectiveCaseFromProfile)) return;

    // The normal reconciliation effect persists a case as soon as the
    // catalogue marker is ready. This on-demand path covers a cold profile
    // menu tap before that marker has arrived, and recovers cases from older
    // builds that left no case in localStorage.
    const nextCaseNumber = nextDealDetectiveCaseNumber(scope);
    const nextQuizCase = buildCurrentQuizCase(nextCaseNumber - 1);
    if (!nextQuizCase) return;
    const nextCase = createStoredDealDetectiveCase(
      cataloguePublicationKey ?? "anonymous-test-case",
      nextQuizCase,
      Date.now() + NEW_SPECIALS_PENDING_TTL_MS,
      detectiveCasePlayedQuestionKind ? alternateQuestionKind(detectiveCasePlayedQuestionKind) : "real",
      nextCaseNumber,
    );
    if (!writeStoredDealDetectiveCase(nextCase, scope)) return;
    clearStoredDealDetectivePlayedState(scope);
    setStored((current) => ({ ...current, detectiveCase: nextCase, detectiveCasePlayedPublicationKey: null, detectiveCasePlayedQuestionKind: null }));
    setDetectiveCaseOpenRequested(true);
  }, [buildCurrentQuizCase, canReplayDetectiveCaseFromProfile, cataloguePublicationKey, currentQuizCase, detectiveCase, detectiveCasePlayedForCurrentPublication, detectiveCasePlayedQuestionKind, playedPairHistoryReady, scope, storageReady]);

  const consumeOpenRequest = useCallback(() => {
    setOpenRequested(false);
  }, []);

  const consumePreviewOpenRequest = useCallback(() => {
    setPreviewOpenRequested(false);
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
    const playedPairKey = dealDetectivePairKeyForCase(storedDetectiveCase.quizCase);
    const nextPlayedPairKeys = [...new Set([...playedPairKeys, playedPairKey])];
    writeStoredDealDetectivePairKeys(nextPlayedPairKeys, scope);
    setPlayedPairKeys(nextPlayedPairKeys);
    writeStoredDealDetectivePlayedState(playedPublicationKey, playedQuestionKind, scope);
    clearStoredDealDetectiveCase(scope);
    setStored((current) => ({ ...current, detectiveCase: null, detectiveCasePlayedPublicationKey: playedPublicationKey, detectiveCasePlayedQuestionKind: playedQuestionKind }));
    setDetectiveCaseOpenRequested(false);
  }, [isAnonymousSession, playedPairKeys, scope, storageReady, storedDetectiveCase]);

  const markPopupShown = useCallback(() => {
    if (!scope || !storageReady || !activePending) return;
    const nextPending = { ...activePending, popupPresented: true };
    const nextPopupState = createNewSpecialsPopupState(activePending.summary, cataloguePublicationKey);
    const wrotePending = writeNewSpecialsPending(nextPending, scope);
    const wrotePopupState = writeNewSpecialsPopupState(nextPopupState, scope);
    // Keep a session-only fallback when storage is unavailable. This does not
    // claim the presentation state was persisted, but it prevents repeated
    // interruption during the current session.
    setSessionPopupState(nextPopupState);
    setStored((current) => ({
      ...current,
      scope,
      snapshot: previousSnapshot,
      pending: wrotePending ? nextPending : activePending,
      popupState: wrotePopupState ? nextPopupState : persistedPopupState,
    }));
    setOpenRequested(false);
  }, [activePending, cataloguePublicationKey, persistedPopupState, previousSnapshot, scope, storageReady]);

  const markReviewed = useCallback((dealKeys?: string[], filter: DealFilter = "all") => {
    if (!scope || !storageReady || !activePending) return;
    const reviewedKeys = filterReviewKeys(activePending.summary, dealKeys, filter);
    if (reviewedKeys.length === 0) return;
    const remainingSummary = removeReviewedNewSpecials(activePending.summary, reviewedKeys);
    if (!remainingSummary) {
      const snapshotToKeep = activePending.snapshot ?? createNewSpecialsSnapshot(products);
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
          lastShownPublicationKey: cataloguePublicationKey,
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
  }, [activePending, cataloguePublicationKey, persistedPopupState, popupState, previousSnapshot, products, scope, storageReady]);

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
      previewSummary,
      previewOpenRequested,
      detectiveCaseOpenRequested,
      requestOpen,
      requestPreviewOpen,
      requestDetectiveCaseOpen,
      consumeOpenRequest,
      consumePreviewOpenRequest,
      consumeDetectiveCaseOpenRequest,
      markPopupShown,
      markReviewed,
      markDetectiveCasePlayed,
    }),
    [canOpenDetectiveCase, consumeDetectiveCaseOpenRequest, consumeOpenRequest, consumePreviewOpenRequest, detectiveCase, detectiveCaseOpenRequested, digest, markDetectiveCasePlayed, markPopupShown, markReviewed, openRequested, pendingDigest, popupEligible, popupSuppressedUntilHomeExit, previewOpenRequested, previewSummary, requestDetectiveCaseOpen, requestOpen, requestPreviewOpen],
  );

  const dataValue = useMemo<NewSpecialsDataContextValue>(
    () => ({
      digest,
      detectiveCase,
      hasUnplayedDetectiveCase: Boolean(detectiveCase),
      canOpenDetectiveCase,
      hasPendingDigest: Boolean(pendingDigest?.total),
      popupEligible,
      popupSuppressedUntilHomeExit,
      openRequested,
      previewSummary,
      previewOpenRequested,
      detectiveCaseOpenRequested,
    }),
    [canOpenDetectiveCase, detectiveCase, detectiveCaseOpenRequested, digest, openRequested, pendingDigest, popupEligible, popupSuppressedUntilHomeExit, previewOpenRequested, previewSummary],
  );

  const actionsValue = useMemo<NewSpecialsActionsContextValue>(
    () => ({
      requestOpen,
      requestPreviewOpen,
      requestDetectiveCaseOpen,
      consumeOpenRequest,
      consumePreviewOpenRequest,
      consumeDetectiveCaseOpenRequest,
      markPopupShown,
      markDetectiveCasePlayed,
      markReviewed,
    }),
    [consumeDetectiveCaseOpenRequest, consumeOpenRequest, consumePreviewOpenRequest, markDetectiveCasePlayed, markPopupShown, markReviewed, requestDetectiveCaseOpen, requestOpen, requestPreviewOpen],
  );

  return (
    <NewSpecialsContext.Provider value={value}>
      <NewSpecialsDataContext.Provider value={dataValue}>
        <NewSpecialsActionsContext.Provider value={actionsValue}>
          {children}
        </NewSpecialsActionsContext.Provider>
      </NewSpecialsDataContext.Provider>
    </NewSpecialsContext.Provider>
  );
}

export function useNewSpecials(): NewSpecialsContextValue {
  const context = useContext(NewSpecialsContext);
  if (!context) throw new Error("useNewSpecials must be used inside NewSpecialsProvider");
  return context;
}

export function useNewSpecialsData(): NewSpecialsDataContextValue {
  const context = useContext(NewSpecialsDataContext);
  if (!context) throw new Error("useNewSpecialsData must be used inside NewSpecialsProvider");
  return context;
}

export function useNewSpecialsActions(): NewSpecialsActionsContextValue {
  const context = useContext(NewSpecialsActionsContext);
  if (!context) throw new Error("useNewSpecialsActions must be used inside NewSpecialsProvider");
  return context;
}

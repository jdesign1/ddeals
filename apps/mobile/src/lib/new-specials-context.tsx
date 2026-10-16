"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { useSearch } from "./search-context";
import {
  clearNewSpecialsPending,
  createNewSpecialsSnapshot,
  getNewSpecialsStorageScope,
  NEW_SPECIALS_PENDING_VERSION,
  readNewSpecialsPending,
  readNewSpecialsSnapshot,
  summarizeNewSpecials,
  writeNewSpecialsPending,
  writeNewSpecialsSnapshot,
  type NewSpecialsPending,
  type NewSpecialsSnapshot,
  type NewSpecialsSummary,
} from "./new-specials";

interface NewSpecialsContextValue {
  digest: NewSpecialsSummary | null;
  hasPendingDigest: boolean;
  openRequested: boolean;
  requestOpen: () => void;
  consumeOpenRequest: () => void;
  acknowledge: () => void;
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
  return JSON.stringify(summary);
}

export function NewSpecialsProvider({ children }: { children: ReactNode }) {
  const { products, loadingProducts } = useSearch();
  const { user, loading: authLoading, isAnonymousSession } = useAuth();
  const scope = authLoading ? null : getNewSpecialsStorageScope(user?.id, isAnonymousSession);
  const [stored, setStored] = useState<StoredNewSpecialsState>({ scope: null, snapshot: null, pending: null });
  // Keep the summary available to the Check Deals page after the launch
  // modal acknowledges it. Pending status stays separate so the modal and
  // notification affordances do not reappear for an already-acknowledged
  // summary during the same app session.
  const [acknowledgedSummary, setAcknowledgedSummary] = useState<NewSpecialsSummary | null>(null);
  const [openRequested, setOpenRequested] = useState(false);

  useEffect(() => {
    if (!scope) return;
    setStored({
      scope,
      snapshot: readNewSpecialsSnapshot(scope),
      pending: readNewSpecialsPending(scope),
    });
    setAcknowledgedSummary(null);
    setOpenRequested(false);
  }, [scope]);

  const storageReady = scope !== null && stored.scope === scope;
  const previousSnapshot = storageReady ? stored.snapshot : null;
  const pending = storageReady ? stored.pending : null;
  const currentSnapshot = useMemo(() => createNewSpecialsSnapshot(products), [products]);
  const detectedSummary = useMemo(
    () => (previousSnapshot ? summarizeNewSpecials(products, previousSnapshot) : null),
    [previousSnapshot, products],
  );
  const detectedDigest = detectedSummary?.total ? detectedSummary : null;
  const pendingDigest = pending?.summary ?? detectedDigest;
  const digest = pendingDigest ?? acknowledgedSummary;

  useEffect(() => {
    if (!scope || !storageReady || loadingProducts || products.length === 0) return;

    if (!previousSnapshot) {
      writeNewSpecialsSnapshot(currentSnapshot, scope);
      clearNewSpecialsPending(scope);
      setStored({ scope, snapshot: currentSnapshot, pending: null });
      return;
    }

    if (!detectedSummary || detectedSummary.total === 0) {
      const snapshotChanged = snapshotFingerprint(previousSnapshot) !== snapshotFingerprint(currentSnapshot);
      if (!snapshotChanged && !pending) return;
      writeNewSpecialsSnapshot(currentSnapshot, scope);
      clearNewSpecialsPending(scope);
      setStored({ scope, snapshot: currentSnapshot, pending: null });
      return;
    }

    const nextPending: NewSpecialsPending = {
      version: NEW_SPECIALS_PENDING_VERSION,
      summary: detectedSummary,
      snapshot: currentSnapshot,
    };
    const pendingUnchanged = pending
      && summaryFingerprint(pending.summary) === summaryFingerprint(detectedSummary)
      && snapshotFingerprint(pending.snapshot) === snapshotFingerprint(currentSnapshot);
    if (pendingUnchanged) return;

    writeNewSpecialsPending(nextPending, scope);
    setStored({ scope, snapshot: previousSnapshot, pending: nextPending });
  }, [currentSnapshot, detectedSummary, loadingProducts, pending, previousSnapshot, products.length, scope, storageReady]);

  const requestOpen = useCallback(() => {
    if (pendingDigest?.total) setOpenRequested(true);
  }, [pendingDigest]);

  const consumeOpenRequest = useCallback(() => {
    setOpenRequested(false);
  }, []);

  const acknowledge = useCallback(() => {
    if (!scope || !storageReady) return;
    const summaryToKeep = pendingDigest;
    const snapshotToKeep = pending?.snapshot ?? currentSnapshot;
    writeNewSpecialsSnapshot(snapshotToKeep, scope);
    clearNewSpecialsPending(scope);
    setStored({ scope, snapshot: snapshotToKeep, pending: null });
    if (summaryToKeep) setAcknowledgedSummary(summaryToKeep);
    setOpenRequested(false);
  }, [currentSnapshot, pending, pendingDigest, scope, storageReady]);

  const value = useMemo<NewSpecialsContextValue>(
    () => ({
      digest,
      hasPendingDigest: Boolean(pendingDigest?.total),
      openRequested,
      requestOpen,
      consumeOpenRequest,
      acknowledge,
    }),
    [acknowledge, consumeOpenRequest, digest, openRequested, pendingDigest, requestOpen],
  );

  return <NewSpecialsContext.Provider value={value}>{children}</NewSpecialsContext.Provider>;
}

export function useNewSpecials(): NewSpecialsContextValue {
  const context = useContext(NewSpecialsContext);
  if (!context) throw new Error("useNewSpecials must be used inside NewSpecialsProvider");
  return context;
}

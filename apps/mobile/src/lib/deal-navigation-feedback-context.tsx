"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import PageLoader from "@/components/PageLoader";

const NAVIGATION_FEEDBACK_DELAY_MS = 100;
const NAVIGATION_FEEDBACK_TIMEOUT_MS = 8_000;

interface DealNavigationFeedbackContextValue {
  startNavigationFeedback: () => void;
}

const DealNavigationFeedbackContext = createContext<DealNavigationFeedbackContextValue | null>(null);

export function DealNavigationFeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const requestIdRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  const timeoutTimerRef = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<{ path: string | null; visible: boolean }>({ path: null, visible: false });

  const clearTimers = useCallback(() => {
    if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    if (timeoutTimerRef.current !== null) window.clearTimeout(timeoutTimerRef.current);
    pendingTimerRef.current = null;
    timeoutTimerRef.current = null;
  }, []);

  const startNavigationFeedback = useCallback(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const sourcePath = pathname;
    clearTimers();
    setFeedback({ path: sourcePath, visible: false });
    pendingTimerRef.current = window.setTimeout(() => {
      if (requestIdRef.current !== requestId) return;
      setFeedback({ path: sourcePath, visible: true });
      timeoutTimerRef.current = window.setTimeout(() => {
        if (requestIdRef.current === requestId) setFeedback({ path: sourcePath, visible: false });
      }, NAVIGATION_FEEDBACK_TIMEOUT_MS);
    }, NAVIGATION_FEEDBACK_DELAY_MS);
  }, [clearTimers, pathname]);

  useEffect(() => () => {
    clearTimers();
  }, [clearTimers]);

  const showLoader = feedback.visible && feedback.path === pathname;

  return (
    <DealNavigationFeedbackContext.Provider value={{ startNavigationFeedback }}>
      {children}
      <PageLoader loading={showLoader} immediate />
    </DealNavigationFeedbackContext.Provider>
  );
}

export function useDealNavigationFeedback(): DealNavigationFeedbackContextValue {
  const context = useContext(DealNavigationFeedbackContext);
  if (!context) throw new Error("useDealNavigationFeedback must be used within DealNavigationFeedbackProvider");
  return context;
}

export function useDealNavigationActivation() {
  const { startNavigationFeedback } = useDealNavigationFeedback();
  const [isNavigating, setIsNavigating] = useState(false);
  const startedRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);

  const beginNavigation = useCallback(() => {
    if (startedRef.current) return false;
    startedRef.current = true;
    setIsNavigating(true);
    startNavigationFeedback();
    resetTimerRef.current = window.setTimeout(() => {
      startedRef.current = false;
      setIsNavigating(false);
    }, NAVIGATION_FEEDBACK_TIMEOUT_MS);
    return true;
  }, [startNavigationFeedback]);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
  }, []);

  return { beginNavigation, isNavigating };
}

"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Menu, RefreshCw } from "lucide-react";
import NewSpecialsModal from "@/components/NewSpecialsModal";
import { LAUNCH_SPLASH_COMPLETE_EVENT } from "@/components/LaunchSplash";
import { useAuth } from "@/lib/auth-context";
import { useHeaderOverride } from "@/lib/header-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import { subscribeToCheckDealsHeaderVisibility } from "@/lib/scroll-events";
import { useSearch } from "@/lib/search-context";
import {
  createNewSpecialsSnapshot,
  readNewSpecialsSnapshot,
  summarizeNewSpecials,
  writeNewSpecialsSnapshot,
  type NewSpecialsSummary,
} from "@/lib/new-specials";

const CONTEXT_HEADER_ROUTES = ["/account", "/how-it-works", "/settings", "/privacy", "/terms", "/support", "/report-deal"];
const ROUTE_TITLES: Record<string, string> = {
  "/account": "Manage account",
  "/how-it-works": "How Dodgy Deal works",
  "/lists": "Watchlist",
  "/specials": "Specials",
  "/me": "Deal stats",
  "/history": "All Checks",
  "/settings": "Settings",
  "/privacy": "Privacy policy",
  "/terms": "Terms of use",
  "/support": "Contact support",
  "/report-deal": "Report an incorrect deal",
};

export default function AppHeader({
  sticky = true,
  collapseOnCheckDeals = false,
  refreshStatus = null,
}: {
  sticky?: boolean;
  collapseOnCheckDeals?: boolean;
  refreshStatus?: "refreshing" | "updated" | "up-to-date" | null;
}) {
  const pathname = usePathname();
  const { isAnonymousSession, user } = useAuth();
  const { override } = useHeaderOverride();
  const { isOpen: isDrawerOpen, toggleDrawer } = useNavigationDrawer();
  const { products, loadingProducts, query, openSearch, openSearchForFilter } = useSearch();
  const [isHiddenOnCheckDeals, setIsHiddenOnCheckDeals] = useState(false);
  const [isLaunchSplashFinished, setIsLaunchSplashFinished] = useState(false);
  const [isNewSpecialsModalOpen, setIsNewSpecialsModalOpen] = useState(false);
  const [newSpecialsModalSummary, setNewSpecialsModalSummary] = useState<NewSpecialsSummary | null>(null);
  const [newSpecialsSnapshot, replaceNewSpecialsSnapshot] = useReducer(
    (_current: ReturnType<typeof readNewSpecialsSnapshot>, next: NonNullable<ReturnType<typeof readNewSpecialsSnapshot>>) => next,
    null,
    readNewSpecialsSnapshot,
  );
  const hasPresentedNewSpecialsThisMount = useRef(false);

  useEffect(() => {
    const syncSplashState = (isComplete = false) => setIsLaunchSplashFinished(isComplete || !document.querySelector(".launch-splash"));
    const handleSplashComplete = () => syncSplashState(true);
    syncSplashState();
    window.addEventListener(LAUNCH_SPLASH_COMPLETE_EVENT, handleSplashComplete);
    return () => window.removeEventListener(LAUNCH_SPLASH_COMPLETE_EVENT, handleSplashComplete);
  }, []);

  useEffect(() => subscribeToCheckDealsHeaderVisibility(setIsHiddenOnCheckDeals), []);

  const currentSpecialsSnapshot = useMemo(() => createNewSpecialsSnapshot(products), [products]);
  const newSpecials = useMemo(
    () => (newSpecialsSnapshot ? summarizeNewSpecials(products, newSpecialsSnapshot) : null),
    [products, newSpecialsSnapshot],
  );

  useEffect(() => {
    if (loadingProducts || products.length === 0) return;
    if (newSpecialsSnapshot && newSpecials?.total) return;
    writeNewSpecialsSnapshot(currentSpecialsSnapshot);
    replaceNewSpecialsSnapshot(currentSpecialsSnapshot);
  }, [currentSpecialsSnapshot, loadingProducts, newSpecials?.total, newSpecialsSnapshot, products.length]);

  const shouldPresentNewSpecialsModal = !loadingProducts && isLaunchSplashFinished && (newSpecials?.total ?? 0) > 0 && pathname === "/";
  useEffect(() => {
    if (!shouldPresentNewSpecialsModal || hasPresentedNewSpecialsThisMount.current) return;
    const presentationTimer = window.setTimeout(() => {
      if (hasPresentedNewSpecialsThisMount.current) return;
      hasPresentedNewSpecialsThisMount.current = true;
      if (!newSpecials) return;
      setNewSpecialsModalSummary(newSpecials);
      writeNewSpecialsSnapshot(currentSpecialsSnapshot);
      replaceNewSpecialsSnapshot(currentSpecialsSnapshot);
      setIsNewSpecialsModalOpen(true);
    }, 0);
    return () => window.clearTimeout(presentationTimer);
  }, [currentSpecialsSnapshot, newSpecials, shouldPresentNewSpecialsModal]);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsHiddenOnCheckDeals(false);
    setIsNewSpecialsModalOpen(false);
  }

  const isContextHeader = Boolean(override) || CONTEXT_HEADER_ROUTES.includes(pathname) || pathname.startsWith("/deal/");
  const contextTitle = override?.title ?? ROUTE_TITLES[pathname] ?? "Dodgy Deal";
  const isHeaderHidden = pathname === "/" && isHiddenOnCheckDeals;

  return (
    <>
      <div
        className={`app-header-shell ${sticky ? "sticky top-0" : ""} z-[45] w-full flex-shrink-0 ${collapseOnCheckDeals && pathname === "/" ? "check-deals-collapsible" : ""} ${collapseOnCheckDeals && isHeaderHidden ? "check-deals-header-collapsed" : ""} ${isHeaderHidden ? "is-hidden" : ""}`}
        aria-hidden={isHeaderHidden}
      >
        {isAnonymousSession && <div className="flex items-center justify-center bg-amber-400 px-4 py-1 text-center dd-type-meta dd-type-meta-strong text-amber-950">Test mode — anonymous test account, not linked to an email</div>}
        <header className="relative flex h-16 w-full items-center bg-white px-4 shadow-sm">
          <AnimatePresence initial={false}>
            {refreshStatus && (
              <motion.div key="refresh-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeOut" }} role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white text-stone-900">
                {refreshStatus === "refreshing" ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
                <span className="dd-type-control">{refreshStatus === "refreshing" ? "Refreshing" : refreshStatus === "updated" ? "Updated" : "Already up to date"}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {isContextHeader ? (
            <div aria-hidden={refreshStatus !== null} className="flex min-w-0 flex-1 items-center gap-2">
              <button type="button" onClick={() => (override?.onBack ? override.onBack() : window.history.back())} aria-label="Back" className="-ml-1.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="min-w-0 flex-1 truncate pr-2 font-display text-base font-extrabold tracking-normal text-ink-900">{contextTitle}</span>
            </div>
          ) : (
            <div aria-hidden={refreshStatus !== null} className="flex min-w-0 flex-1 items-center gap-2.5">
              <button type="button" id="global-header-menu-btn" aria-label={user ? "Open profile menu" : "Open menu"} aria-controls="global-navigation-drawer" aria-expanded={isDrawerOpen} onClick={toggleDrawer} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200">
                {user ? (
                  <span className="material-symbols-outlined text-[28px] leading-none" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }} aria-hidden="true">
                    account_circle
                  </span>
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <button type="button" onClick={openSearch} aria-label="Search Dodgy Deal" data-onboarding="search-bar" className="dd-search-control flex h-11 min-w-0 flex-1 items-center rounded-full border border-stone-300 bg-white px-4 text-left transition-colors hover:bg-stone-50 focus:outline-none focus-visible:border-stone-900">
                <Image src="/logo.svg" alt="" width={28} height={28} className="theme-logo mr-3 h-7 w-7 flex-shrink-0 animate-mascot-header-blink" />
                <span className={`min-w-0 flex-1 truncate text-base ${query ? "font-medium text-stone-700" : "font-normal text-stone-400"}`}>{query || "Search Dodgy Deal"}</span>
              </button>
            </div>
          )}
        </header>
      </div>

      {newSpecialsModalSummary && (
        <NewSpecialsModal open={isNewSpecialsModalOpen && pathname === "/"} summary={newSpecialsModalSummary} onClose={() => setIsNewSpecialsModalOpen(false)} onSelectFilter={(filter, dealKeys) => { setIsNewSpecialsModalOpen(false); openSearchForFilter(filter, { focus: false, dealKeys }); }} />
      )}
    </>
  );
}

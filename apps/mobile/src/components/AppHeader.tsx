"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Menu, RefreshCw, Share2 } from "lucide-react";
import NewSpecialsModal from "@/components/NewSpecialsModal";
import { LAUNCH_SPLASH_COMPLETE_EVENT } from "@/components/LaunchSplash";
import { useAuth } from "@/lib/auth-context";
import { getAccountDisplayName } from "@/lib/account-display";
import { useHeaderOverride } from "@/lib/header-context";
import { useNavigationDrawer } from "@/lib/navigation-drawer-context";
import { subscribeToCheckDealsHeaderVisibility } from "@/lib/scroll-events";
import { useSearch } from "@/lib/search-context";
import { WATCHLIST_SHARE_EVENT } from "@/lib/watchlist-events";
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
  const { isAnonymousSession, user, profile } = useAuth();
  const { override } = useHeaderOverride();
  const { isOpen: isDrawerOpen, toggleDrawer } = useNavigationDrawer();
  const { products, loadingProducts, query, setQuery, openSearch, openSearchForFilter } = useSearch();
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
  const isWatchlist = pathname === "/lists";
  const contextTitle = override?.title ?? ROUTE_TITLES[pathname] ?? "Dodgy Deal";
  const isHeaderHidden = pathname === "/" && isHiddenOnCheckDeals;
  const profileDisplayName = user ? getAccountDisplayName(user, { full_name: profile?.full_name }) : "";
  const avatarInitial = profileDisplayName.charAt(0).toUpperCase();

  return (
    <>
      <div
        className={`app-header-shell ${sticky ? "sticky top-0" : ""} z-[45] w-full flex-shrink-0 ${collapseOnCheckDeals && pathname === "/" ? "check-deals-collapsible" : ""} ${collapseOnCheckDeals && isHeaderHidden ? "check-deals-header-collapsed" : ""} ${isHeaderHidden ? "is-hidden" : ""}`}
        aria-hidden={isHeaderHidden}
      >
        {isAnonymousSession && <div className="flex items-center justify-center bg-amber-400 px-4 py-1 text-center dd-type-meta dd-type-meta-strong text-amber-950">Test mode — anonymous test account, not linked to an email</div>}
        <header className="relative flex h-16 w-full items-center bg-white px-4">
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
              <button type="button" id="global-header-menu-btn" aria-label={user ? "Open profile menu" : "Open menu"} aria-controls="global-navigation-drawer" aria-expanded={isDrawerOpen} onClick={toggleDrawer} className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200 ${user ? "border-fair-600 bg-fair-600 text-white hover:bg-fair-700" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}>
                {user ? (
                  <span className="text-base font-bold text-white" aria-hidden="true">
                    {avatarInitial}
                  </span>
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <label data-onboarding="search-bar" className="dd-search-control flex h-11 min-w-0 flex-1 items-center rounded-full border border-stone-300 bg-white px-4 text-left transition-colors focus-within:border-stone-900">
                <Image src="/logo.svg" alt="" width={32} height={32} className="theme-logo mr-3 h-8 w-8 flex-shrink-0 animate-mascot-header-blink" />
                <input
                  id="global-search-input"
                  type="search"
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    if (value.length > 0) openSearch();
                  }}
                  onFocus={openSearch}
                  aria-label="Search Dodgy Deal"
                  placeholder="Search Dodgy Deal"
                  className="mobile-zoom-safe-input h-11 min-w-0 flex-1 border-none bg-transparent p-0 font-sans text-base text-stone-700 placeholder:text-stone-400 focus:outline-none"
                  enterKeyHint="search"
                />
              </label>
              {isWatchlist && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(WATCHLIST_SHARE_EVENT))}
                  aria-label="Share Watchlist"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-200"
                >
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
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

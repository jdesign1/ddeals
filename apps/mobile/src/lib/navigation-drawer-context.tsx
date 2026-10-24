"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type NavigationDrawerContextValue = {
  isOpen: boolean;
  isTransitioningToSettings: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  beginSettingsNavigation: () => void;
  completeSettingsNavigation: () => void;
};

const NavigationDrawerContext = createContext<NavigationDrawerContextValue | null>(null);

export function NavigationDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isTransitioningToSettings, setIsTransitioningToSettings] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    // Keep the profile drawer mounted across the Settings route handoff. The
    // route can paint behind it first, then AppDrawer closes it after the new
    // page has had a frame to render. Other route changes retain the normal
    // immediate close behavior.
    if (!(pathname === "/settings" && isTransitioningToSettings)) {
      setIsOpen(false);
    }
  }

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((open) => !open), []);
  const beginSettingsNavigation = useCallback(() => setIsTransitioningToSettings(true), []);
  const completeSettingsNavigation = useCallback(() => setIsTransitioningToSettings(false), []);

  const value = useMemo(
    () => ({
      isOpen,
      isTransitioningToSettings,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      beginSettingsNavigation,
      completeSettingsNavigation,
    }),
    [beginSettingsNavigation, closeDrawer, completeSettingsNavigation, isOpen, isTransitioningToSettings, openDrawer, toggleDrawer]
  );

  return <NavigationDrawerContext.Provider value={value}>{children}</NavigationDrawerContext.Provider>;
}

export function useNavigationDrawer(): NavigationDrawerContextValue {
  const value = useContext(NavigationDrawerContext);
  if (!value) throw new Error("useNavigationDrawer must be used inside NavigationDrawerProvider");
  return value;
}

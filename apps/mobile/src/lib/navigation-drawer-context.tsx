"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type NavigationDrawerContextValue = {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const NavigationDrawerContext = createContext<NavigationDrawerContextValue | null>(null);

export function NavigationDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((open) => !open), []);

  const value = useMemo(
    () => ({ isOpen, openDrawer, closeDrawer, toggleDrawer }),
    [closeDrawer, isOpen, openDrawer, toggleDrawer]
  );

  return <NavigationDrawerContext.Provider value={value}>{children}</NavigationDrawerContext.Provider>;
}

export function useNavigationDrawer(): NavigationDrawerContextValue {
  const value = useContext(NavigationDrawerContext);
  if (!value) throw new Error("useNavigationDrawer must be used inside NavigationDrawerProvider");
  return value;
}

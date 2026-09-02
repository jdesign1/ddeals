"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "dodgey-deals-theme";

type ThemeContextValue = {
  theme: Theme;
  isDarkMode: boolean;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with the server-safe light value. The inline bootstrap in the root
  // layout applies a saved dark theme before the first paint, while this
  // effect synchronises the React state after hydration without markup
  // mismatches.
  const [theme, setThemeState] = useState<Theme>("light");

  useLayoutEffect(() => {
    const savedTheme = document.documentElement.dataset.theme ?? null;
    let frameId: number | undefined;

    const syncTheme = (nextTheme: Theme) => {
      frameId = window.requestAnimationFrame(() => {
        setThemeState(nextTheme);
        applyTheme(nextTheme);
      });
    };

    if (isTheme(savedTheme)) {
      syncTheme(savedTheme);
    } else {
      try {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (isTheme(storedTheme)) syncTheme(storedTheme);
      } catch {
        // Private browsing and embedded WebViews can deny localStorage access.
      }
    }

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The visual preference still applies for this session if persistence
      // is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, isDarkMode: theme === "dark", setTheme }),
    [setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Preferences } from "@capacitor/preferences";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "dodgey-deals-theme";

type ThemeContextValue = {
  theme: Theme;
  isDarkMode: boolean;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function persistNativeTheme(theme: Theme) {
  // Capacitor Preferences mirrors this value into iOS UserDefaults, which is
  // the only preference store available early enough for the native launch
  // storyboard. The browser implementation is safe to call during web
  // development as well.
  void Preferences.set({ key: THEME_STORAGE_KEY, value: theme }).catch(() => {
    // The web preference still applies when the native bridge is absent or
    // unavailable, such as a normal desktop browser session.
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start with the server-safe light value. The inline bootstrap in the root
  // layout applies the user's saved Display setting before the first paint,
  // while this effect synchronises the React state after hydration without
  // markup mismatches. The app deliberately does not inspect the device's
  // prefers-color-scheme value: the Settings > Display toggle is the sole
  // source of truth.
  const [theme, setThemeState] = useState<Theme>("light");
  const themeChangeVersionRef = useRef(0);

  useLayoutEffect(() => {
    const savedTheme = document.documentElement.dataset.theme ?? null;
    let frameId: number | undefined;

    const syncTheme = (nextTheme: Theme) => {
      frameId = window.requestAnimationFrame(() => {
        setThemeState(nextTheme);
        applyTheme(nextTheme);
      });
    };

    const initialTheme = isTheme(savedTheme) ? savedTheme : "light";
    syncTheme(initialTheme);

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const browserTheme = document.documentElement.dataset.theme;
    void Preferences.get({ key: THEME_STORAGE_KEY })
      .then(({ value }) => {
        // The native value is the fallback for a WebView where localStorage
        // was cleared or unavailable. Do not let a stale asynchronous read
        // overwrite a toggle the user has already made in this session.
        if (cancelled || themeChangeVersionRef.current > 0) return;
        if (!isTheme(value)) {
          // This also migrates an existing localStorage-only Display setting
          // into the native store on the first launch after native splash
          // support is installed.
          persistNativeTheme(isTheme(browserTheme) ? browserTheme : "light");
          return;
        }
        setThemeState(value);
        applyTheme(value);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, value);
        } catch {
          // The native preference remains available even if localStorage is
          // unavailable in this WebView.
        }
      })
      .catch(() => {
        // The inline browser bootstrap remains the immediate fallback.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    themeChangeVersionRef.current += 1;
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The visual preference still applies for this session if persistence
      // is unavailable.
    }
    // Keep the native shell's UserDefaults mirror in step with the web
    // preference. The iOS launch storyboard appears before this WebView can
    // read localStorage, so the native copy is what selects its appearance
    // on the next cold launch.
    persistNativeTheme(nextTheme);
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

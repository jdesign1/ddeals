"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Preferences } from "@capacitor/preferences";
import { SplashScreen } from "@capacitor/splash-screen";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "dodgey-deals-theme";
const THEME_COLOR: Record<Theme, string> = {
  light: "#faf8f4",
  dark: "#171513",
};

// Capacitor bridge calls are asynchronous. Queue them so two quick toggles
// cannot finish out of order and leave the next native launch on the old
// appearance.
let nativeThemeWrite = Promise.resolve();

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
  document.body?.setAttribute("data-theme", theme);
  document.body?.style.setProperty("color-scheme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

function readBrowserTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function persistNativeTheme(theme: Theme) {
  // Capacitor Preferences mirrors this value into iOS UserDefaults, which is
  // the only preference store available early enough for the native launch
  // storyboard. The browser implementation is safe to call during web
  // development as well.
  nativeThemeWrite = nativeThemeWrite
    .catch(() => {
      // Keep later writes available if an earlier bridge call failed.
    })
    .then(() => Preferences.set({ key: THEME_STORAGE_KEY, value: theme }))
    .catch(() => {
      // The web preference still applies when the native bridge is absent or
      // unavailable, such as a normal desktop browser session.
    });
}

function hideNativeSplash() {
  // The native shell keeps its launch storyboard visible until the WebView
  // has resolved the saved theme. This prevents a light WebView frame from
  // appearing between the native splash and the dark launch animation.
  void SplashScreen.hide().catch(() => {
    // The web build has no native splash to hide.
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
  const themeRef = useRef<Theme>("light");
  const pathname = usePathname();

  useLayoutEffect(() => {
    const savedTheme = document.documentElement.dataset.theme ?? null;
    const initialTheme = isTheme(savedTheme) ? savedTheme : "light";
    themeRef.current = initialTheme;
    applyTheme(initialTheme);
    // This mirrors the before-paint bootstrap into React state. It is an
    // intentional one-time hydration sync, not a derived-state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initialTheme);
  }, []);

  // App Router keeps this provider mounted while page content changes. If a
  // navigation or WebView resume restores stale document attributes, restore
  // the selected appearance before the next route paints.
  useLayoutEffect(() => {
    applyTheme(themeRef.current);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const browserTheme = readBrowserTheme();
    void Preferences.get({ key: THEME_STORAGE_KEY })
      .then(({ value }) => {
        // The native value is the fallback for a WebView where localStorage
        // was cleared or unavailable. Do not let a stale asynchronous read
        // overwrite a toggle the user has already made in this session.
        if (cancelled || themeChangeVersionRef.current > 0) {
          hideNativeSplash();
          return;
        }
        // A valid browser value is the preference the user changed in this
        // running WebView. Native Preferences are only a fallback for a
        // cleared/unavailable localStorage store; otherwise an older native
        // bridge read could visibly undo Settings after navigation.
        if (browserTheme) {
          themeRef.current = browserTheme;
          setThemeState(browserTheme);
          applyTheme(browserTheme);
          persistNativeTheme(browserTheme);
          hideNativeSplash();
          return;
        }
        if (!isTheme(value)) {
          persistNativeTheme(themeRef.current);
          hideNativeSplash();
          return;
        }
        themeRef.current = value;
        setThemeState(value);
        applyTheme(value);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, value);
        } catch {
          // The native preference remains available even if localStorage is
          // unavailable in this WebView.
        }
        hideNativeSplash();
      })
      .catch(() => {
        // The inline browser bootstrap remains the immediate fallback.
        hideNativeSplash();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const restoreTheme = () => applyTheme(themeRef.current);
    const syncAcrossWebViews = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
      themeChangeVersionRef.current += 1;
      themeRef.current = event.newValue;
      setThemeState(event.newValue);
      applyTheme(event.newValue);
      persistNativeTheme(event.newValue);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") restoreTheme();
    };

    window.addEventListener("pageshow", restoreTheme);
    window.addEventListener("storage", syncAcrossWebViews);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", restoreTheme);
      window.removeEventListener("storage", syncAcrossWebViews);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    themeChangeVersionRef.current += 1;
    themeRef.current = nextTheme;
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

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  themes: Theme[];
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  forcedTheme?: string;
  setTheme: Dispatch<SetStateAction<string>>;
}

interface ThemeProviderProps {
  children: ReactNode;
  attribute?: "class" | `data-${string}`;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
}

const THEMES: Theme[] = ["light", "dark", "system"];
const MEDIA = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function storedTheme(storageKey: string, fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : fallback;
  } catch {
    return fallback;
  }
}

function withoutTransitions() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;animation-duration:0s!important}",
    ),
  );
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => style.remove(), 1);
  };
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = "theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => storedTheme(storageKey, defaultTheme));
  const [system, setSystem] = useState<ResolvedTheme>("light");

  const resolvedTheme =
    theme === "system" && enableSystem ? system : theme === "dark" ? "dark" : "light";

  const applyTheme = useCallback(
    (next: ResolvedTheme) => {
      const restoreTransitions = disableTransitionOnChange ? withoutTransitions() : null;
      const root = document.documentElement;
      if (attribute === "class") {
        root.classList.remove("light", "dark");
        root.classList.add(next);
      } else {
        root.setAttribute(attribute, next);
      }
      root.style.colorScheme = next;
      restoreTransitions?.();
    },
    [attribute, disableTransitionOnChange],
  );

  useEffect(() => {
    const media = window.matchMedia(MEDIA);
    const updateSystem = () => setSystem(media.matches ? "dark" : "light");
    updateSystem();
    media.addEventListener("change", updateSystem);
    return () => media.removeEventListener("change", updateSystem);
  }, []);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [applyTheme, resolvedTheme]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      setThemeState(storedTheme(storageKey, defaultTheme));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTheme, storageKey]);

  const setTheme: Dispatch<SetStateAction<string>> = useCallback(
    (value) => {
      setThemeState((current) => {
        const nextValue = typeof value === "function" ? value(current) : value;
        const next: Theme =
          nextValue === "light" || nextValue === "dark" || nextValue === "system"
            ? nextValue
            : defaultTheme;
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // Private browsing or locked-down browsers can reject localStorage.
        }
        return next;
      });
    },
    [defaultTheme, storageKey],
  );

  const value = useMemo(
    () => ({
      themes: enableSystem ? THEMES : THEMES.filter((item) => item !== "system"),
      theme,
      resolvedTheme,
      systemTheme: system,
      setTheme,
    }),
    [enableSystem, resolvedTheme, setTheme, system, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return value;
}

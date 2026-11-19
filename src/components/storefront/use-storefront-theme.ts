"use client";

import { useCallback, useSyncExternalStore } from "react";

export type StorefrontTheme = "light" | "dark";

const THEME_EVENT = "pnyshop-theme-change";

function getThemeSnapshot(): StorefrontTheme {
  return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): StorefrontTheme {
  return "light";
}

function subscribeTheme(onStoreChange: () => void) {
  const updateTheme = () => {
    document.documentElement.dataset.theme = getThemeSnapshot();
    onStoreChange();
  };
  window.addEventListener("storage", updateTheme);
  window.addEventListener(THEME_EVENT, updateTheme);
  return () => {
    window.removeEventListener("storage", updateTheme);
    window.removeEventListener(THEME_EVENT, updateTheme);
  };
}

export function useStorefrontTheme() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerSnapshot,
  );

  const setTheme = useCallback((nextTheme: StorefrontTheme) => {
    window.localStorage.setItem("theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { theme, setTheme };
}

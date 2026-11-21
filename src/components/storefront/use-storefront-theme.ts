"use client";

import { useCallback, useSyncExternalStore } from "react";

export type StorefrontTheme = "light" | "dark";
export type StorefrontThemePreference = StorefrontTheme | "system";

const THEME_EVENT = "pnyshop-theme-change";

function getPreferenceSnapshot(): StorefrontThemePreference {
  const preference = window.localStorage.getItem("theme");
  return preference === "dark" || preference === "light" || preference === "system"
    ? preference
    : "system";
}

function getThemeSnapshot(): StorefrontTheme {
  const preference = getPreferenceSnapshot();
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
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
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", updateTheme);
  return () => {
    window.removeEventListener("storage", updateTheme);
    window.removeEventListener(THEME_EVENT, updateTheme);
    media.removeEventListener("change", updateTheme);
  };
}

export function useStorefrontTheme() {
  const preference = useSyncExternalStore(
    subscribeTheme,
    getPreferenceSnapshot,
    () => "system",
  );
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerSnapshot,
  );

  const setThemePreference = useCallback((nextTheme: StorefrontThemePreference) => {
    window.localStorage.setItem("theme", nextTheme);
    const resolved = nextTheme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : nextTheme;
    document.documentElement.dataset.theme = resolved;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const setTheme = useCallback((nextTheme: StorefrontTheme) => {
    setThemePreference(nextTheme);
  }, [setThemePreference]);

  return { theme, preference, setTheme, setThemePreference };
}

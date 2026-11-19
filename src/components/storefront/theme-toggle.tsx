"use client";

import { useStorefrontTheme } from "./use-storefront-theme";

export function ThemeToggle() {
  const { theme, setTheme } = useStorefrontTheme();

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return (
    <button
      className="themeToggle"
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "فعال کردن حالت شب" : "فعال کردن حالت روز"}
      aria-pressed={theme === "dark"}
    >
      <span aria-hidden="true">{theme === "light" ? "☾" : "☼"}</span>
    </button>
  );
}

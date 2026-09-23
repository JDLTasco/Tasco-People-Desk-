"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "tpd-theme";

// The actual early (pre-hydration) theme application lives in layout.tsx's
// inline blocking script, so there's no flash of the wrong theme on load --
// this component just needs to reflect and toggle whatever <html
// data-theme> already is. Starts "light" on the server (there's no
// document there) and syncs to the real value on mount rather than reading
// document.documentElement during the initial render, which would mismatch
// the server-rendered markup and trigger a hydration warning.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark" | undefined) ?? "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / blocked storage -- the toggle still works for
      // this page view, it just won't persist to the next visit.
    }
  }

  return (
    <button type="button" className="nav-icon-btn" onClick={toggle} title="Toggle dark mode">
      {theme === "dark" ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}

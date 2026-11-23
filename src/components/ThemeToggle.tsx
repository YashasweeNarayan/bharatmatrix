"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

/**
 * Minimal sun/moon switch. Reads the theme the inline script in
 * layout.tsx already applied (so this never causes its own flash),
 * then just toggles the same data-theme attribute + localStorage key
 * going forward — every surface color is a CSS variable (globals.css),
 * so flipping this one attribute re-themes the whole app.
 */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.setAttribute("data-theme", next ? "light" : "dark");
    try {
      localStorage.setItem("bm-theme", next ? "light" : "dark");
    } catch {
      // Private browsing or storage disabled — theme just won't persist.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      title={light ? "Switch to dark theme" : "Switch to light theme"}
      className="relative flex h-7 w-12 flex-shrink-0 items-center rounded-full border border-ink-700 bg-ink-800 transition-colors"
    >
      <span
        className={clsx(
          "flex h-5 w-5 items-center justify-center rounded-full bg-saffron-500 text-onaccent transition-transform duration-200 ease-in-out",
          light ? "translate-x-[26px]" : "translate-x-[3px]",
        )}
      >
        {light ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
      </span>
    </button>
  );
}

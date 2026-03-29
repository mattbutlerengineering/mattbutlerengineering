/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import "@mbe/rialto/styles";
import "./global.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { App } from "./App";

/* ── Theme persistence ────────────────────────── */
const THEME_KEY = "mbe-theme-preference";

type ThemePreference = "light" | "dark" | "system";

function getStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable
  }
  return "system";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/* ── Root component ───────────────────────────── */
function Root() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const resolved = resolveTheme(preference);

  const handleThemeToggle = () => {
    const next: ThemePreference = resolved === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme still works in memory
    }
    setPreference(next);
  };

  return (
    // RialtoProvider MUST wrap BrowserRouter (outside it)
    <RialtoProvider theme={resolved}>
      <BrowserRouter>
        <App theme={resolved} onThemeToggle={handleThemeToggle} />
      </BrowserRouter>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

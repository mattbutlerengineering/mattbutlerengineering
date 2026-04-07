import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { GlobalNav, RialtoProvider, type VibeName } from "@mbe/rialto";
import { useCookieConsent } from "../components/CookieConsent/useCookieConsent";
import { CookieBanner, CookiePreferencesDialog } from "../components/CookieConsent/CookieConsent";
import styles from "./DemoLayout.module.css";

export interface FloatingControlsProps {
  darkMode: boolean;
  onDarkModeChange: (value: boolean) => void;
  rtl: boolean;
  onRtlChange: (value: boolean) => void;
  activeVibe: VibeName;
  onVibeChange: (value: VibeName) => void;
  onOpenCookiePrefs?: () => void;
}

export function FloatingControls({
  darkMode,
  onDarkModeChange,
  rtl,
  onRtlChange,
  activeVibe,
  onVibeChange,
  onOpenCookiePrefs,
}: FloatingControlsProps) {
  return (
    <>
      <button
        className={styles.controlButton}
        onClick={() => onDarkModeChange(!darkMode)}
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {darkMode ? (
            <>
              <circle cx="8" cy="8" r="3" />
              <line x1="8" y1="1.5" x2="8" y2="3" />
              <line x1="8" y1="13" x2="8" y2="14.5" />
              <line x1="2.4" y1="2.4" x2="3.5" y2="3.5" />
              <line x1="12.5" y1="12.5" x2="13.6" y2="13.6" />
              <line x1="1.5" y1="8" x2="3" y2="8" />
              <line x1="13" y1="8" x2="14.5" y2="8" />
              <line x1="2.4" y1="13.6" x2="3.5" y2="12.5" />
              <line x1="12.5" y1="3.5" x2="13.6" y2="2.4" />
            </>
          ) : (
            <path d="M12 3a6 6 0 1 0 0 10A6 6 0 0 1 12 3Z" />
          )}
        </svg>
      </button>

      <button
        className={styles.controlButton}
        onClick={() => onRtlChange(!rtl)}
        aria-label={rtl ? "Switch to LTR" : "Switch to RTL"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {rtl ? (
            <>
              <line x1="2" y1="8" x2="14" y2="8" />
              <polyline points="10,4 14,8 10,12" />
              <line x1="4" y1="4" x2="4" y2="12" />
            </>
          ) : (
            <>
              <line x1="2" y1="8" x2="14" y2="8" />
              <polyline points="6,4 2,8 6,12" />
              <line x1="12" y1="4" x2="12" y2="12" />
            </>
          )}
        </svg>
      </button>

      {onOpenCookiePrefs && (
        <button
          className={styles.controlButton}
          onClick={onOpenCookiePrefs}
          aria-label="Cookie preferences"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="6.5" />
            <circle cx="5.5" cy="6" r="1" fill="currentColor" stroke="none" />
            <circle cx="9" cy="5" r="0.75" fill="currentColor" stroke="none" />
            <circle cx="10.5" cy="8" r="1" fill="currentColor" stroke="none" />
            <circle cx="6" cy="10" r="0.75" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="11" r="0.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}

      <select
        className={styles.vibeSelect}
        value={activeVibe}
        onChange={(e) => onVibeChange(e.target.value as VibeName)}
        aria-label="Select vibe"
      >
        <option value="default">Default</option>
        <option value="transacting">Transacting</option>
        <option value="presenting">Presenting</option>
      </select>
    </>
  );
}

const THEME_KEY = "mbe-theme-preference";

export function DemoLayout() {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);
  const [activeVibe, setActiveVibe] = useState<VibeName>("default");
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved === "dark";
    } catch {
      // localStorage unavailable
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [rtl, setRtl] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rialto-dir") === "rtl";
  });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsKey, setPrefsKey] = useState(0);
  const cookie = useCookieConsent();

  const openPrefs = () => {
    setPrefsKey((k) => k + 1);
    setPrefsOpen(true);
  };

  const handleDarkModeChange = (value: boolean) => {
    setDarkMode(value);
    try {
      localStorage.setItem(THEME_KEY, value ? "dark" : "light");
    } catch {
      // Theme still works in memory
    }
  };

  useEffect(() => {
    localStorage.setItem("rialto-dir", rtl ? "rtl" : "ltr");
  }, [rtl]);

  const demoTheme: "light" | "dark" = darkMode ? "dark" : "light";

  return (
    <RialtoProvider vibe={activeVibe} theme={demoTheme}>
      <div dir={rtl ? "rtl" : undefined}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <GlobalNav currentApp="rialto" theme={demoTheme} onThemeToggle={() => handleDarkModeChange(!darkMode)} />
        <div className={styles.floatingControls}>
          <FloatingControls
            darkMode={darkMode}
            onDarkModeChange={handleDarkModeChange}
            rtl={rtl}
            onRtlChange={setRtl}
            activeVibe={activeVibe}
            onVibeChange={setActiveVibe}
            onOpenCookiePrefs={openPrefs}
          />
        </div>
        <main id="main-content" tabIndex={-1} style={{ outline: "none" }}>
          <Outlet />
        </main>
        <CookieBanner
          consented={cookie.consented}
          onAcceptAll={cookie.acceptAll}
          onRejectAll={cookie.rejectAll}
          onCustomize={openPrefs}
        />
        <CookiePreferencesDialog
          key={prefsKey}
          open={prefsOpen}
          onClose={() => setPrefsOpen(false)}
          preferences={cookie.preferences}
          onSave={cookie.savePreferences}
          onRejectAll={cookie.rejectAll}
        />
      </div>
    </RialtoProvider>
  );
}

DemoLayout.displayName = "DemoLayout";

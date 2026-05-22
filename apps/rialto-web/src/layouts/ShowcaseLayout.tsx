import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Footer, GlobalNav } from "@mattbutlerengineering/rialto";
import { ShowcaseSidebar } from "../components/ShowcaseSidebar";
import { NAV_SECTIONS, DEMO_PAGES } from "../data/nav-sections";
import { useThemeContext } from "../ThemeContext";
import styles from "./ShowcaseLayout.module.css";

/* ── Props ───────────────────────────────────── */
export interface ShowcaseLayoutProps {
  theme?: "light" | "dark";
  onThemeToggle?: () => void;
}

/**
 * App shell for the Rialto showcase.
 *
 * Structure:
 * - Shared GlobalNav (cross-app navigation + theme toggle)
 * - Left sidebar with all component categories + demos section (fixed, not scrolling with content)
 * - Main content area (Outlet) — only this scrolls
 * - Footer at bottom of content scroll area
 */
export function ShowcaseLayout(props: ShowcaseLayoutProps) {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);

  const themeCtx = useThemeContext();
  const theme = props.theme ?? themeCtx.theme;
  const onThemeToggle = props.onThemeToggle ?? themeCtx.onThemeToggle;
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const handleMobileClose = useCallback(() => {
    setIsMobileMenuOpen(false);
    toggleButtonRef.current?.focus();
  }, []);

  const handleMobileToggle = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  return (
    <div className={styles.root}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <GlobalNav currentApp="rialto" theme={theme} onThemeToggle={onThemeToggle} />

      {/* ── Mobile sidebar toggle (visible < 768px only) ── */}
      <button
        ref={toggleButtonRef}
        className={styles.mobileSidebarToggle}
        onClick={handleMobileToggle}
        aria-label={isMobileMenuOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={isMobileMenuOpen}
        type="button"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* ── Body (sidebar + content) ────────────── */}
      <div className={styles.body}>
        <ShowcaseSidebar
          sections={NAV_SECTIONS}
          demoPages={DEMO_PAGES}
          activePath={location.pathname}
          onNavigate={navigate}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={handleMobileClose}
        />

        <main id="main-content" tabIndex={-1} className={styles.content}>
          <Outlet />

          {/* Footer lives inside the scroll area — visible at end of content */}
          <div className={styles.contentFooter}>
            <Footer
              variant="rich"
              logo={
                <>
                  Ri<span style={{ color: "var(--rialto-accent)" }}>a</span>lto
                </>
              }
              columns={[
                {
                  title: "Platform",
                  links: [
                    {
                      label: "mattbutlerengineering.com",
                      href: "https://mattbutlerengineering.com",
                    },
                    { label: "Hospitality", href: "https://mattbutlerengineering.com/hospitality" },
                  ],
                },
                {
                  title: "Design System",
                  links: [
                    { label: "GitHub", href: "https://github.com/mattbutlerengineering" },
                    { label: "Overview", href: "/rialto/" },
                  ],
                },
              ]}
              copyright={`\u00A9 ${new Date().getFullYear()} Matt Butler Engineering. All rights reserved.`}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

ShowcaseLayout.displayName = "ShowcaseLayout";

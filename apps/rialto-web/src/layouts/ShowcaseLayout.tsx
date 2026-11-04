import { useState, useCallback, useEffect, useRef } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { Footer, GlobalNav } from "@mattbutlerengineering/rialto";
import { ShowcaseSidebar } from "../components/ShowcaseSidebar";
import { NAV_SECTIONS, DEMO_PAGES } from "../data/nav-sections";
import { useScrollToTop } from "../hooks/use-scroll-to-top.js";
import { useThemeContext } from "../ThemeContext";
import styles from "./ShowcaseLayout.module.css";

/**
 * App shell for the Rialto showcase.
 *
 * Structure:
 * - Shared GlobalNav (cross-app navigation + theme toggle)
 * - Left sidebar with all component categories + demos section (fixed, not scrolling with content)
 * - Main content area (Outlet) — only this scrolls
 * - Footer at bottom of content scroll area
 */
export function ShowcaseLayout() {
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);

  const { theme, toggleTheme } = useThemeContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const returnFocusToToggleRef = useRef(false);

  // The window never scrolls in this layout — <main> is the scroll container.
  useScrollToTop(mainRef);

  const handleMobileClose = useCallback(() => {
    returnFocusToToggleRef.current = true;
    setIsMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen && returnFocusToToggleRef.current) {
      returnFocusToToggleRef.current = false;
      toggleButtonRef.current?.focus();
    }
  }, [isMobileMenuOpen]);

  const handleMobileOpen = useCallback(() => {
    setNavMenuOpen(false);
    setIsMobileMenuOpen(true);
  }, []);

  const handleNavMenuOpenChange = useCallback((open: boolean) => {
    setNavMenuOpen(open);
    if (open) setIsMobileMenuOpen(false);
  }, []);

  return (
    <div className={styles.root}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <GlobalNav
        currentApp="rialto"
        theme={theme}
        onThemeToggle={toggleTheme}
        mobileMenuOpen={navMenuOpen}
        onMobileMenuOpenChange={handleNavMenuOpenChange}
      />

      {/* ── Body (sidebar + content) ────────────── */}
      <div className={styles.body}>
        {/* In-flow on small screens so it never covers page content or the drawer.
            Hidden while the drawer is open; the drawer has its own close control. */}
        <div className={styles.mobileNavBar} hidden={isMobileMenuOpen ? true : undefined}>
          {/* eslint-disable mbe-local/prefer-rialto-components */}
          <button
            ref={toggleButtonRef}
            className={styles.mobileSidebarToggle}
            onClick={handleMobileOpen}
            aria-label="Open sidebar"
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
          {/* eslint-enable mbe-local/prefer-rialto-components */}
        </div>

        <ShowcaseSidebar
          sections={NAV_SECTIONS}
          demoPages={DEMO_PAGES}
          activePath={location.pathname}
          onNavigate={navigate}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={handleMobileClose}
        />

        <main id="main-content" tabIndex={-1} className={styles.content} ref={mainRef}>
          <Outlet />

          {/* Footer lives inside the scroll area — visible at end of content */}
          <div className={styles.contentFooter}>
            <Footer
              variant="rich"
              logo={
                <>
                  {/* eslint-disable mbe-local/prefer-rialto-components */}
                  Ri<span style={{ color: "var(--rialto-accent)" }}>a</span>lto
                  {/* eslint-enable mbe-local/prefer-rialto-components */}
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
              copyright={`© ${new Date().getFullYear()} Matt Butler Engineering. All rights reserved.`}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

ShowcaseLayout.displayName = "ShowcaseLayout";

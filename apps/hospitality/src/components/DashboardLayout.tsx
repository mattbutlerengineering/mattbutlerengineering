import { useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { GenCopilot } from "@mbe/rialto";
import { registry } from "@mbe/rialto-catalog";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
import { NAV_SECTIONS } from "../nav-sections.js";
import type { NavItem } from "../nav-sections.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import styles from "./DashboardLayout.module.css";

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, accessToken } = useAuth();

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Stable token getter — passes latest token to GenCopilot without recreating on every render
  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  const handleMobileClose = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleMobileToggle = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  // Build extra items to inject into named sections (immutable map)
  const extraItems = useMemo(() => {
    const map = new Map<string, readonly NavItem[]>();
    map.set("Account", [
      { id: "signout", label: "Sign Out", path: "/__signout__" },
    ]);
    return map;
  }, []);

  // Handle navigation — intercept special paths
  const handleNavigate = useCallback(
    (path: string) => {
      if (path === "/__signout__") {
        signOut();
        return;
      }
      navigate(path);
    },
    [navigate, signOut]
  );

  // Build a Tools section with Copilot toggle appended to sections
  const sectionsWithCopilot = useMemo(
    () => [
      ...NAV_SECTIONS,
      {
        label: "Tools" as const,
        items: [
          {
            id: "copilot",
            label: "Copilot",
            path: "/__copilot__",
          },
        ],
      },
    ],
    []
  );

  // Custom navigate that handles copilot toggle
  const handleNavigateWithCopilot = useCallback(
    (path: string) => {
      if (path === "/__copilot__") {
        setCopilotOpen((prev) => !prev);
        return;
      }
      handleNavigate(path);
    },
    [handleNavigate]
  );

  // Copilot is "active" when open — map its sentinel path to current location
  const activePath = copilotOpen && location.pathname === location.pathname
    ? location.pathname
    : location.pathname;

  return (
    <div className={styles.root} data-testid="dashboard-layout">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      {/* ── Mobile sidebar toggle (visible < 768px only) ── */}
      <button
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

      <div className={styles.body}>
        <DashboardSidebar
          sections={sectionsWithCopilot}
          activePath={activePath}
          onNavigate={handleNavigateWithCopilot}
          extraItems={extraItems}
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={handleMobileClose}
        />

        <main id="main-content" className={styles.content}>
          <Outlet />
        </main>
      </div>

      {/* Conditionally mount GenCopilot — destroying it on close resets all streaming state */}
      {copilotOpen && (
        <GenCopilot
          onClose={() => setCopilotOpen(false)}
          api="/api/gen/ui"
          domainContext={HOSPITALITY_DOMAIN_CONTEXT}
          getAccessToken={getAccessToken}
          registry={registry}
        />
      )}
    </div>
  );
}

import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useLocation, Navigate, Outlet } from "react-router";
import { useAuth } from "@mbe/auth/react";
import {
  Breadcrumb,
  CommandPalette,
  ErrorBoundary,
  ChatPanel,
  Kbd,
  Button,
  Stack,
  Text,
  Heading,
} from "@mattbutlerengineering/rialto";
import type { BreadcrumbItem } from "@mattbutlerengineering/rialto";
import { registry } from "@mbe/rialto-catalog";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
import { useCommandPalette } from "../hooks/use-command-palette.js";
import { useTheme, resolveTheme } from "../hooks/use-theme.js";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { buildNavSections } from "../nav-sections.js";
import type { NavItem } from "../nav-sections.js";
import { VenueProvider } from "../contexts/VenueContext.js";
import { SSESyncProvider, useSSESync } from "../hooks/useSSESync.js";
import { useIsAdmin } from "../hooks/useIsAdmin.js";
import { LoadingPage } from "../pages/LoadingPage.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { SystemHealthBadge } from "./SystemHealthBadge.js";
import { VenueSwitcher } from "./VenueSwitcher.js";
import styles from "./DashboardLayout.module.css";

const ROUTE_LABELS: Record<string, string> = {
  "": "Timeline",
  timeline: "Timeline",
  reservations: "Reservations",
  guests: "Guests",
  waitlist: "Waitlist",
  "floor-plans": "Floor Plans",
  "booking-widget": "Booking Widget",
  onboarding: "New Venue",
  profile: "Profile",
  settings: "Settings",
  admin: "Admin",
  dashboard: "Dashboard",
  setup: "Setup",
  hours: "Operating Hours",
};

/** Operational pages that should redirect to /setup when not yet ready */
const OPERATIONAL_ONLY_PATHS = ["/timeline", "/reservations", "/guests"];

/**
 * Inner layout that has access to VenueProvider context.
 * Uses useVenueReadiness to build dynamic nav sections and enforce redirects.
 */
function DashboardLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, accessToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const readiness = useVenueReadiness();
  const isAdmin = useIsAdmin();
  useSSESync();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const path = location.pathname.replace(/^\/hospitality/, "");

  // Single source of truth for the two render-time-gate branches below —
  // computed once and reused by the instrumentation effect so the two can't
  // silently drift apart.
  const isLoadingGate = readiness.status === "loading";
  const isNoVenueRedirectGate =
    readiness.status === "no-venue" &&
    !path.startsWith("/onboarding") &&
    !path.startsWith("/callback");

  // Readiness-based redirect guard for "setup" and "operational" statuses.
  // "loading" and "no-venue" are handled by the render-time gate below
  // instead of here: an effect runs after commit and paint, so routing those
  // two through an effect would paint the full dashboard chrome for at least
  // one frame before bouncing away (#3889).
  useEffect(() => {
    if (readiness.status === "setup") {
      const isOperationalPage = OPERATIONAL_ONLY_PATHS.some(
        (p) => path === p || path.startsWith(p + "/")
      );
      if (isOperationalPage) {
        navigate("/setup", { replace: true });
      }
      return;
    }

    if (readiness.status === "operational") {
      if (path === "/setup" || path.startsWith("/setup/")) {
        navigate("/timeline", { replace: true });
      }
      // Redirect old root (index) to timeline
      if (path === "/" || path === "") {
        navigate("/timeline", { replace: true });
      }
    }
  }, [readiness.status, path, navigate]);

  // E2E-only instrumentation: records that the full-chrome branch below is
  // about to render, rather than the loading/no-venue render-time gate
  // (#3918). A plain render-body write here would violate React's render
  // purity (and this repo's lint rule for it), so this reports the fact via
  // an effect instead — mutating `window` directly is only safe from an
  // effect. It stays a same-mount-cycle signal, not a return to
  // effect-driven redirects: no navigate() call was reintroduced, and the
  // gate branches below are unchanged. Mirrors the "test harness reads a
  // window global" pattern of window.__e2eNoRetry in QueryProvider.tsx.
  useEffect(() => {
    if (!isLoadingGate && !isNoVenueRedirectGate) {
      (window as unknown as { __e2eChromePainted?: boolean }).__e2eChromePainted = true;
    }
  }, [isLoadingGate, isNoVenueRedirectGate]);

  // Toggle theme between light and dark
  const toggleTheme = useCallback(() => {
    const resolved = resolveTheme(theme);
    setTheme(resolved === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  // Stable token getter — passes latest token without recreating on every render
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
    map.set("Account", [{ id: "signout", label: "Sign Out", path: "/__signout__" }]);
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

  const sections = useMemo(
    () => [
      ...buildNavSections(readiness, isAdmin),
      {
        label: "Tools" as const,
        items: [
          {
            id: "chat",
            label: "Chat",
            path: "/__chat__",
          },
        ],
      },
    ],
    [readiness, isAdmin]
  );

  // Command palette state — receives dynamic sections so items stay in sync
  const {
    open: paletteOpen,
    setOpen: setPaletteOpen,
    items: paletteItems,
    groups: paletteGroups,
  } = useCommandPalette({ sections, navigate, toggleTheme, signOut });

  const handleNavigateWithChat = useCallback(
    (path: string) => {
      if (path === "/__chat__") {
        setChatMounted(true);
        setChatOpen((prev) => !prev);
        return;
      }
      handleNavigate(path);
    },
    [handleNavigate]
  );

  const activePath = location.pathname;

  // Build breadcrumb items from current route
  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const pathname = location.pathname;
    // Strip the basename "/hospitality" if present
    const path = pathname.replace(/^\/hospitality/, "").replace(/^\//, "");
    const segments = path.split("/").filter(Boolean);

    // On root or timeline page, show "Home" as the sole current-page crumb
    if (segments.length === 0 || (segments.length === 1 && segments[0] === "timeline")) {
      return [{ label: "Home" }];
    }

    // Always start with a clickable "Home" linking to /timeline
    const items: BreadcrumbItem[] = [{ label: "Home", onClick: () => navigate("/timeline") }];

    // Build intermediate + final crumbs
    let accumulated = "";
    for (let i = 0; i < segments.length; i++) {
      accumulated += `/${segments[i]}`;
      const isLast = i === segments.length - 1;
      const label = ROUTE_LABELS[segments[i]!] ?? "Details";

      if (isLast) {
        items.push({ label });
      } else {
        const target = accumulated;
        items.push({ label, onClick: () => navigate(target) });
      }
    }

    return items;
  }, [location.pathname, navigate]);

  // Render-time gate: decide before painting any dashboard chrome, instead of
  // in a post-commit effect (#3889). All hooks above must still run
  // unconditionally on every render for the Rules of Hooks.
  if (isLoadingGate) {
    return <LoadingPage />;
  }

  if (isNoVenueRedirectGate) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className={styles.root} data-testid="dashboard-layout">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      {/* ── Command palette ── */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={paletteItems}
        groups={paletteGroups}
        placeholder="Search pages and actions..."
      />

      {/* ── Mobile sidebar toggle (visible < 768px only) ── */}
      <Button
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
      </Button>

      <div className={styles.body}>
        <div className={styles.sidebarColumn}>
          <DashboardSidebar
            sections={sections}
            activePath={activePath}
            onNavigate={handleNavigateWithChat}
            extraItems={extraItems}
            isMobileOpen={isMobileMenuOpen}
            onMobileClose={handleMobileClose}
            headerSlot={<VenueSwitcher onNavigate={handleNavigate} />}
          />
          <Button
            type="button"
            className={styles.commandHint}
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <Kbd>{navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
            <Text className={styles.commandHintLabel}>Search</Text>
          </Button>
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className={styles.content}
          style={{ outline: "none" }}
        >
          <div className={styles.breadcrumbBar}>
            <Breadcrumb items={breadcrumbs} />
            <SystemHealthBadge />
          </div>
          <ErrorBoundary
            fallback={
              <Stack
                align="center"
                justify="center"
                gap="md"
                style={{
                  padding: "var(--rialto-space-xl)",
                  textAlign: "center",
                  minHeight: "400px",
                }}
              >
                <Heading level={2}>Something went wrong</Heading>
                <Text color="secondary">An unexpected error occurred in this page.</Text>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </Stack>
            }
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {chatMounted && (
        <div
          data-chat-wrapper=""
          style={{ display: chatOpen ? undefined : "none", zIndex: "var(--rialto-z-overlay)" }}
        >
          <ChatPanel
            onClose={() => setChatOpen(false)}
            api="/api/gen/agent"
            domainContext={HOSPITALITY_DOMAIN_CONTEXT}
            getAccessToken={getAccessToken}
            registry={registry}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Outer shell: wraps VenueProvider + SSESyncProvider around DashboardLayoutInner.
 * SSESyncProvider must be inside VenueProvider because useSSESync calls useVenue.
 */
export function DashboardLayout() {
  return (
    <VenueProvider>
      <SSESyncProvider>
        <DashboardLayoutInner />
      </SSESyncProvider>
    </VenueProvider>
  );
}

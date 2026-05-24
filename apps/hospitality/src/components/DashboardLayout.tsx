import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
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
import { useReservationQuerySync } from "../hooks/useReservationQuerySync.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { SystemHealthBadge } from "./SystemHealthBadge.js";
import { VenueSwitcher } from "./VenueSwitcher.js";
import styles from "./DashboardLayout.module.css";

const ROUTE_LABELS: Record<string, string> = {
  "": "Timeline",
  timeline: "Timeline",
  reservations: "Reservations",
  guests: "Guests",
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
  useReservationQuerySync();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Readiness-based redirect guard
  useEffect(() => {
    const path = location.pathname.replace(/^\/hospitality/, "");

    if (readiness.status === "no-venue") {
      if (!path.startsWith("/onboarding") && !path.startsWith("/callback")) {
        navigate("/onboarding", { replace: true });
      }
      return;
    }

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
  }, [readiness.status, location.pathname, navigate]);

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

  const sections = useMemo(
    () => [
      ...buildNavSections(readiness),
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
    [readiness]
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

    // On home/timeline page, just show "Timeline" as current (no link)
    if (segments.length === 0) {
      return [{ label: "Timeline" }];
    }

    // Always start with a clickable Timeline (new home)
    const items: BreadcrumbItem[] = [
      { label: "Timeline", onClick: () => navigate("/timeline") },
    ];

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
                <Text color="secondary">
                  An unexpected error occurred in this page.
                </Text>
                <Button
                  variant="secondary"
                  onClick={() => window.location.reload()}
                >
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
          style={{ display: chatOpen ? undefined : "none" }}
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
 * Outer shell: wraps VenueProvider around DashboardLayoutInner so that
 * useVenueReadiness (which calls useVenue) can be used inside the layout.
 */
export function DashboardLayout() {
  return (
    <VenueProvider>
      <DashboardLayoutInner />
    </VenueProvider>
  );
}

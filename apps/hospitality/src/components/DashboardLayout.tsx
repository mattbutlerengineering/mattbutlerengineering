import { useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Breadcrumb, CommandPalette, ErrorBoundary, GenCopilot, Kbd, useToast } from "@mbe/rialto";
import type { BreadcrumbItem } from "@mbe/rialto";
import { registry } from "@mbe/rialto-catalog";
import type { Reservation } from "@mbe/types";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
import { useCommandPalette } from "../hooks/use-command-palette.js";
import { useReservationEvents } from "../hooks/useReservationEvents.js";
import { useTheme, resolveTheme } from "../hooks/use-theme.js";
import { NAV_SECTIONS } from "../nav-sections.js";
import type { NavItem } from "../nav-sections.js";
import { VenueProvider } from "../contexts/VenueContext.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import styles from "./DashboardLayout.module.css";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  "timeline": "Timeline",
  "reservations": "Reservations",
  "guests": "Guests",
  "floor-plans": "Floor Plans",
  "booking-widget": "Booking Widget",
  "onboarding": "New Venue",
  "profile": "Profile",
  "settings": "Settings",
  "admin": "Admin",
};

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, accessToken } = useAuth();
  const { theme, setTheme } = useTheme();

  const { toast } = useToast();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // SSE toast notifications for real-time reservation events
  useReservationEvents({
    enabled: true,
    onReservationCreated: useCallback(
      (reservation: Reservation) => {
        toast({
          title: "New reservation",
          description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          variant: "accent",
          duration: 5000,
        });
      },
      [toast]
    ),
    onReservationCancelled: useCallback(
      (reservation: Reservation) => {
        toast({
          title: "Reservation cancelled",
          description: `${reservation.guestName ?? "Guest"}'s reservation was cancelled`,
          variant: "error",
          duration: 5000,
        });
      },
      [toast]
    ),
  });

  // Toggle theme between light and dark
  const toggleTheme = useCallback(() => {
    const resolved = resolveTheme(theme);
    setTheme(resolved === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  // Command palette state
  const {
    open: paletteOpen,
    setOpen: setPaletteOpen,
    items: paletteItems,
    groups: paletteGroups,
  } = useCommandPalette({ navigate, toggleTheme, signOut });

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

  // Build breadcrumb items from current route
  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const pathname = location.pathname;
    // Strip the basename "/hospitality" if present
    const path = pathname.replace(/^\/hospitality/, "").replace(/^\//, "");
    const segments = path.split("/").filter(Boolean);

    // On home page, just show "Home" as current (no link)
    if (segments.length === 0) {
      return [{ label: "Home" }];
    }

    // Always start with a clickable Home
    const items: BreadcrumbItem[] = [
      { label: "Home", onClick: () => navigate("/") },
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
        <div className={styles.sidebarColumn}>
          <DashboardSidebar
            sections={sectionsWithCopilot}
            activePath={activePath}
            onNavigate={handleNavigateWithCopilot}
            extraItems={extraItems}
            isMobileOpen={isMobileMenuOpen}
            onMobileClose={handleMobileClose}
          />
          <button
            type="button"
            className={styles.commandHint}
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <Kbd>{navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
            <span className={styles.commandHintLabel}>Search</span>
          </button>
        </div>

        <main id="main-content" tabIndex={-1} className={styles.content}>
          <div className={styles.breadcrumbBar}>
            <Breadcrumb items={breadcrumbs} />
          </div>
          <ErrorBoundary
            fallback={
              <div style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
                <h2>Something went wrong</h2>
                <p style={{ color: "var(--rialto-text-secondary)", marginBlock: "var(--rialto-space-md)" }}>
                  An unexpected error occurred in this page.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    padding: "var(--rialto-space-sm) var(--rialto-space-md)",
                    borderRadius: "var(--rialto-radius-default)",
                    border: "1px solid var(--rialto-border)",
                    background: "var(--rialto-surface-elevated)",
                    color: "var(--rialto-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Reload
                </button>
              </div>
            }
          >
            <VenueProvider>
              <Outlet />
            </VenueProvider>
          </ErrorBoundary>
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

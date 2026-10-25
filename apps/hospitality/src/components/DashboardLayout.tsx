import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useLocation, Navigate, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { streamNDJSON } from "@mbe/api-client/streaming";
import { useAuth, useAccessToken } from "@mbe/auth/react";
import {
  Banner,
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
import {
  HOSPITALITY_DOMAIN_CONTEXT,
  useChatRequestContext,
  useChatSuggestions,
  useDescribeChatAction,
} from "../constants/copilotContext.js";
import { getSessionLapseCopy } from "../constants/session-lapse-copy.js";
import { useCommandPalette } from "../hooks/use-command-palette.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { useTheme } from "../hooks/use-theme.js";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { buildNavSections, ACCOUNT_SECTION_ID } from "../nav-sections.js";
import { runNavAction } from "../nav-actions.js";
import type { NavAction } from "../nav-actions.js";
import { VenueProvider, useVenue } from "../contexts/VenueContext.js";
import { VenueThemeProvider } from "../providers/VenueTheme.js";
import { SSESyncProvider, useSSESync } from "../hooks/useSSESync.js";
import { useIsAdmin } from "../hooks/useIsAdmin.js";
import { LoadingPage } from "../pages/LoadingPage.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { ErrorRetryBanner } from "./ErrorRetryBanner.js";
import { DashboardSidebar } from "./DashboardSidebar.js";
import { LocalePicker } from "./LocalePicker/index.js";
import { SystemHealthBadge } from "./SystemHealthBadge.js";
import { VenueSwitcher } from "./VenueSwitcher.js";
import styles from "./DashboardLayout.module.css";

/** Route segment -> catalog key for its breadcrumb / document-title label. */
const ROUTE_LABEL_KEYS = {
  "": "layout.routes.timeline",
  timeline: "layout.routes.timeline",
  reservations: "layout.routes.reservations",
  guests: "layout.routes.guests",
  waitlist: "layout.routes.waitlist",
  briefing: "layout.routes.briefing",
  "floor-plans": "layout.routes.floorPlans",
  menus: "layout.routes.menus",
  "booking-widget": "layout.routes.bookingWidget",
  onboarding: "layout.routes.onboarding",
  profile: "layout.routes.profile",
  settings: "layout.routes.settings",
  admin: "layout.routes.admin",
  dashboard: "layout.routes.dashboard",
  setup: "layout.routes.setup",
  hours: "layout.routes.hours",
  chat: "layout.routes.chat",
} as const;

function routeLabel(t: TFunction, segment: string): string {
  const key = (
    ROUTE_LABEL_KEYS as Record<string, (typeof ROUTE_LABEL_KEYS)[keyof typeof ROUTE_LABEL_KEYS]>
  )[segment];
  return key ? t(key) : t("layout.details");
}

/** The search-hint key cap; a key name, not translatable text. */
const SEARCH_KEY = "K";

/** Operational pages that should redirect to /setup when not yet ready */
const OPERATIONAL_ONLY_PATHS = ["/timeline", "/reservations", "/guests"];

/**
 * Inner layout that has access to VenueProvider context.
 * Uses useVenueReadiness to build dynamic nav sections and enforce redirects.
 */
function DashboardLayoutInner() {
  const { t } = useTranslation();
  const sessionCopy = getSessionLapseCopy(t);
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signOut, accessToken } = useAuth();
  const { refreshError } = useAccessToken();
  const { resolvedTheme, setTheme } = useTheme();
  const readiness = useVenueReadiness();
  const isAdmin = useIsAdmin();
  const { selectedVenue, venuesError, refetchVenues } = useVenue();
  const chatRequestContext = useChatRequestContext();
  const chatSuggestions = useChatSuggestions();
  const describeChatAction = useDescribeChatAction();
  useSSESync();

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Silent-refresh failure banner: dismissal is tracked per error instance so
  // a NEW failure after dismissal surfaces again (render-time derivation, no
  // effect-driven state sync).
  const [dismissedRefreshError, setDismissedRefreshError] = useState<Error | null>(null);
  const showRefreshBanner = refreshError !== null && refreshError !== dismissedRefreshError;

  const path = location.pathname.replace(/^\/hospitality/, "");

  // Per-route document title (#4973): every dashboard route previously
  // inherited the static "Dashboard - Matt Butler Engineering" title, so tab
  // switching, browser history, and screen-reader page announcements
  // couldn't distinguish one page from another. Reuses the same
  // last-segment -> ROUTE_LABELS lookup as the breadcrumbs below, so the two
  // can't silently diverge.
  const pageSegments = path.replace(/^\//, "").split("/").filter(Boolean);
  const pageLabel = routeLabel(t, pageSegments[pageSegments.length - 1] ?? "");
  useDocumentTitle(
    t("layout.documentTitle", {
      page: pageLabel,
      venue: selectedVenue?.name ?? t("layout.venueFallback"),
    })
  );

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
      // Only bounce the /setup checklist itself — /setup/hours (and any
      // other /setup/* subpage) must stay reachable so a manager can edit
      // operating hours after a venue goes operational (#4982).
      if (path === "/setup") {
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
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setTheme]);

  // Stable token getter — passes latest token without recreating on every render
  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  const handleMobileClose = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleMobileToggle = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  // Re-authenticate after a failed silent refresh, preserving the current
  // page (app-relative, so the post-login restore doesn't double-prefix the
  // /hospitality basename) through the OIDC round-trip.
  const handleSignInAgain = useCallback(() => {
    signIn({ returnTo: (path || "/") + location.search + location.hash });
  }, [signIn, path, location.search, location.hash]);

  const toggleChat = useCallback(() => {
    setChatMounted(true);
    setChatOpen((prev) => !prev);
  }, []);

  // One resolver for every surface (sidebar, command palette) — no sentinel paths to intercept.
  const runAction = useCallback(
    (action: NavAction) => runNavAction(action, { navigate, toggleChat, signOut }),
    [navigate, toggleChat, signOut]
  );

  const sections = useMemo(
    () => [
      ...buildNavSections(readiness, isAdmin, t).map((section) =>
        section.id === ACCOUNT_SECTION_ID
          ? {
              ...section,
              items: [
                ...section.items,
                {
                  id: "signout",
                  label: t("nav.items.signOut"),
                  action: { type: "signout" } as const,
                },
              ],
            }
          : section
      ),
      {
        id: "Tools",
        label: t("nav.sections.tools"),
        items: [
          {
            id: "chat",
            label: t("nav.items.chat"),
            action: { type: "chat" } as const,
          },
        ],
      },
    ],
    [readiness, isAdmin, t]
  );

  // Command palette state — receives dynamic sections so items stay in sync
  const {
    open: paletteOpen,
    setOpen: setPaletteOpen,
    items: paletteItems,
    groups: paletteGroups,
  } = useCommandPalette({ sections, runAction, toggleTheme });

  const activePath = location.pathname;

  // Build breadcrumb items from current route
  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const pathname = location.pathname;
    // Strip the basename "/hospitality" if present
    const path = pathname.replace(/^\/hospitality/, "").replace(/^\//, "");
    const segments = path.split("/").filter(Boolean);

    // On root or timeline page, show "Home" as the sole current-page crumb
    if (segments.length === 0 || (segments.length === 1 && segments[0] === "timeline")) {
      return [{ label: t("layout.home") }];
    }

    // Always start with a clickable "Home" linking to /timeline
    const items: BreadcrumbItem[] = [
      { label: t("layout.home"), onClick: () => navigate("/timeline") },
    ];

    // Build intermediate + final crumbs
    let accumulated = "";
    for (let i = 0; i < segments.length; i++) {
      accumulated += `/${segments[i]}`;
      const isLast = i === segments.length - 1;
      const label = routeLabel(t, segments[i]!);

      if (isLast) {
        items.push({ label });
      } else {
        const target = accumulated;
        items.push({ label, onClick: () => navigate(target) });
      }
    }

    return items;
  }, [location.pathname, navigate, t]);

  // Render-time gate: decide before painting any dashboard chrome, instead of
  // in a post-commit effect (#3889). All hooks above must still run
  // unconditionally on every render for the Rules of Hooks.
  // A failed venues fetch also reads as "no-venue" downstream; show a retry
  // state rather than sending an existing operator into onboarding.
  if (venuesError && !selectedVenue) {
    const { detail, raw } = describeApiError(venuesError);
    return (
      <ErrorRetryBanner
        title={t("layout.venuesNotLoaded")}
        error={detail}
        details={raw}
        onRetry={() => void refetchVenues()}
      />
    );
  }

  if (isLoadingGate) {
    return <LoadingPage />;
  }

  if (isNoVenueRedirectGate) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className={styles.root} data-testid="dashboard-layout">
      <a href="#main-content" className={styles.skipLink}>
        {t("shell.skipToContent")}
      </a>

      {/* ── Command palette ── */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={paletteItems}
        groups={paletteGroups}
        placeholder={t("layout.searchPlaceholder")}
      />

      {/* ── Mobile sidebar toggle (visible < 768px only) ── */}
      <Button
        className={styles.mobileSidebarToggle}
        onClick={handleMobileToggle}
        aria-label={isMobileMenuOpen ? t("layout.closeSidebar") : t("layout.openSidebar")}
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
            onAction={runAction}
            isMobileOpen={isMobileMenuOpen}
            onMobileClose={handleMobileClose}
            headerSlot={<VenueSwitcher onNavigate={navigate} />}
            footerSlot={<LocalePicker variant="sidebar" />}
          />
          <Button
            type="button"
            className={styles.commandHint}
            onClick={() => setPaletteOpen(true)}
            aria-label={t("layout.openPalette")}
          >
            <Kbd>{navigator.platform?.includes("Mac") ? "\u2318" : t("layout.ctrlKey")}</Kbd>
            <Kbd>{SEARCH_KEY}</Kbd>
            <Text className={styles.commandHintLabel}>{t("layout.search")}</Text>
          </Button>
        </div>

        <main id="main-content" tabIndex={-1} className={styles.content}>
          {showRefreshBanner && (
            <Banner
              variant="warning"
              dismissible
              onDismiss={() => setDismissedRefreshError(refreshError)}
              action={
                <Button variant="secondary" onClick={handleSignInAgain}>
                  {sessionCopy.action}
                </Button>
              }
            >
              {sessionCopy.refreshFailedLead} {sessionCopy.body}
            </Banner>
          )}
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
                <Heading level={2}>{t("layout.errorHeading")}</Heading>
                <Text color="secondary">{t("layout.errorBody")}</Text>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  {t("layout.reload")}
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
            stream={streamNDJSON}
            domainContext={HOSPITALITY_DOMAIN_CONTEXT}
            getAccessToken={getAccessToken}
            registry={registry}
            requestContext={chatRequestContext}
            suggestions={chatSuggestions}
            describeAction={describeChatAction}
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
        <VenueThemeProvider>
          <DashboardLayoutInner />
        </VenueThemeProvider>
      </SSESyncProvider>
    </VenueProvider>
  );
}

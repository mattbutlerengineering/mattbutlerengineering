import "@mattbutlerengineering/rialto/styles";
import "./index.css";
import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { RialtoProvider, ErrorBoundary } from "@mattbutlerengineering/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { QueryProvider } from "./providers/QueryProvider.js";
import { initSentry, handleErrorBoundary } from "@mbe/sentry/react";
import { ThemeContext, useThemeState } from "./hooks/use-theme";
import { App, CallbackRedirect } from "./App";
import { AuthConfigError } from "./components/AuthConfigError";
import { LoadingPage } from "./pages/LoadingPage";
import { RequireAdmin } from "./components/RequireAdmin";
import { validateAuthConfig } from "./constants/auth";
import { currentHostConfig, legacyPathRedirect } from "./lib/host-brand.js";
import { I18nextProvider } from "react-i18next";
import { localeRuntime, LocaleBridge } from "./i18n/runtime.js";
import { ToastLocaleOverride } from "./components/booking-widget/ToastLocaleOverride.js";

initSentry({
  appName: "hospitality",
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});

// Lazy-loaded route components — each becomes its own chunk
const DashboardLayout = lazy(() =>
  import("./components/DashboardLayout.js").then((m) => ({
    default: m.DashboardLayout,
  }))
);
const OnboardingLayout = lazy(() =>
  import("./layouts/OnboardingLayout.js").then((m) => ({
    default: m.OnboardingLayout,
  }))
);
const TimelinePage = lazy(() =>
  import("./pages/TimelinePage.js").then((m) => ({ default: m.TimelinePage }))
);
const HomePage = lazy(() => import("./pages/HomePage.js").then((m) => ({ default: m.HomePage })));
const ReservationsPage = lazy(() =>
  import("./pages/ReservationsPage.js").then((m) => ({
    default: m.ReservationsPage,
  }))
);
const GuestsPage = lazy(() =>
  import("./pages/GuestsPage.js").then((m) => ({ default: m.GuestsPage }))
);
const WaitlistPage = lazy(() =>
  import("./pages/WaitlistPage.js").then((m) => ({ default: m.WaitlistPage }))
);
const FloorPlansPage = lazy(() =>
  import("./pages/FloorPlansPage.js").then((m) => ({
    default: m.FloorPlansPage,
  }))
);
const MenusPage = lazy(() =>
  import("./pages/MenusPage.js").then((m) => ({ default: m.MenusPage }))
);
const FloorPlanEditorPage = lazy(() =>
  import("./pages/FloorPlanEditorPage.js").then((m) => ({
    default: m.FloorPlanEditorPage,
  }))
);
const BookingWidgetDemoPage = lazy(() =>
  import("./pages/BookingWidgetDemoPage.js").then((m) => ({
    default: m.BookingWidgetDemoPage,
  }))
);
const AvailabilityPage = lazy(() =>
  import("./pages/AvailabilityPage.js").then((m) => ({ default: m.AvailabilityPage }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage.js").then((m) => ({ default: m.ProfilePage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage.js").then((m) => ({ default: m.SettingsPage }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage.js").then((m) => ({ default: m.AdminPage }))
);
const VenueOnboardingPage = lazy(() =>
  import("./pages/VenueOnboardingPage.js").then((m) => ({
    default: m.VenueOnboardingPage,
  }))
);
const SetupPage = lazy(() =>
  import("./pages/SetupPage.js").then((m) => ({ default: m.SetupPage }))
);
const PublicBookingPage = lazy(() =>
  import("./pages/PublicBookingPage.js").then((m) => ({
    default: m.PublicBookingPage,
  }))
);
const PublicMenusPage = lazy(() =>
  import("./pages/PublicMenusPage.js").then((m) => ({
    default: m.PublicMenusPage,
  }))
);
const PublicMenuPage = lazy(() =>
  import("./pages/PublicMenuPage.js").then((m) => ({
    default: m.PublicMenuPage,
  }))
);
const ManageReservationPage = lazy(() =>
  import("./pages/ManageReservationPage.js").then((m) => ({
    default: m.ManageReservationPage,
  }))
);
const ChatPage = lazy(() => import("./pages/ChatPage.js").then((m) => ({ default: m.ChatPage })));
const BriefingPage = lazy(() =>
  import("./pages/BriefingPage.js").then((m) => ({ default: m.BriefingPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage.js").then((m) => ({ default: m.NotFoundPage }))
);

// Validate auth config at startup — fail fast with a user-friendly error
const authConfigResult = validateAuthConfig();

// The app owns eat-sheet.com's root but lives under /hospitality elsewhere
// (#7709). On a root-served host, map a legacy /hospitality/* URL (older email
// links, asset-base-relative hrefs) onto its in-app path before the router
// reads the location.
const HOST = currentHostConfig();
const legacyPath = legacyPathRedirect(window.location.pathname, HOST.basename);
if (legacyPath !== null) {
  window.history.replaceState(
    window.history.state,
    "",
    legacyPath + window.location.search + window.location.hash
  );
}

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 * BrowserRouter had a bug where initial page loads didn't strip the basename,
 * causing "No routes matched" warnings and catch-all redirects.
 */
/**
 * Route tree: callback is outside DashboardLayout (no sidebar/nav needed).
 * All other routes are inside DashboardLayout. The catch-all lives inside
 * DashboardLayout so it doesn't compete with the pathless layout route —
 * React Router v7 can misroute when pathless layouts and named routes
 * coexist at the same level.
 *
 * Index route: TimelinePage (was HomePage/Dashboard).
 * Dashboard moves to /dashboard.
 * Setup pages: /setup. (/setup/hours redirects to /availability.)
 */
const router = createBrowserRouter(
  [
    // Public booking page — no auth, accessible without login
    {
      path: "book/:venueSlug",
      element: (
        <Suspense fallback={<LoadingPage />}>
          <PublicBookingPage />
        </Suspense>
      ),
    },
    // Public menus — no auth, same guest surface as the booking page
    {
      path: "menu/:venueSlug",
      element: (
        <Suspense fallback={<LoadingPage />}>
          <PublicMenusPage />
        </Suspense>
      ),
    },
    {
      path: "menu/:venueSlug/:menuSlug",
      element: (
        <Suspense fallback={<LoadingPage />}>
          <PublicMenuPage />
        </Suspense>
      ),
    },
    {
      path: "reservations/manage",
      element: (
        <Suspense fallback={<LoadingPage />}>
          <ManageReservationPage />
        </Suspense>
      ),
    },
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        {
          path: "onboarding",
          element: (
            <Suspense fallback={<LoadingPage />}>
              <OnboardingLayout />
            </Suspense>
          ),
          children: [
            {
              index: true,
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <VenueOnboardingPage />
                </Suspense>
              ),
            },
          ],
        },
        {
          element: (
            <Suspense fallback={<LoadingPage />}>
              <DashboardLayout />
            </Suspense>
          ),
          children: [
            {
              // Index: Timeline is the default landing page in operational mode.
              // DashboardLayout redirects to /setup for new venues or /timeline for operational ones.
              index: true,
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <TimelinePage />
                </Suspense>
              ),
            },
            {
              path: "timeline",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <TimelinePage />
                </Suspense>
              ),
            },
            {
              path: "dashboard",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <HomePage />
                </Suspense>
              ),
            },
            {
              path: "reservations",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <ReservationsPage />
                </Suspense>
              ),
            },
            {
              path: "guests",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <GuestsPage />
                </Suspense>
              ),
            },
            {
              path: "waitlist",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <WaitlistPage />
                </Suspense>
              ),
            },
            {
              path: "briefing",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <BriefingPage />
                </Suspense>
              ),
            },
            {
              path: "floor-plans",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <FloorPlansPage />
                </Suspense>
              ),
            },
            {
              path: "floor-plans/:id",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <FloorPlanEditorPage />
                </Suspense>
              ),
            },
            {
              path: "availability",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <AvailabilityPage />
                </Suspense>
              ),
            },
            {
              path: "menus",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <MenusPage />
                </Suspense>
              ),
            },
            {
              path: "menus/:menuId",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <MenusPage />
                </Suspense>
              ),
            },
            {
              path: "booking-widget",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <BookingWidgetDemoPage />
                </Suspense>
              ),
            },
            {
              path: "chat",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <ChatPage />
                </Suspense>
              ),
            },
            {
              path: "profile",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <ProfilePage />
                </Suspense>
              ),
            },
            {
              path: "settings",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <SettingsPage />
                </Suspense>
              ),
            },
            {
              path: "admin",
              element: (
                <RequireAdmin>
                  <Suspense fallback={<LoadingPage />}>
                    <AdminPage />
                  </Suspense>
                </RequireAdmin>
              ),
            },
            {
              path: "setup",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <SetupPage />
                </Suspense>
              ),
            },
            {
              path: "setup/hours",
              element: <Navigate to="/availability" replace />,
            },
            {
              path: "*",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <NotFoundPage />
                </Suspense>
              ),
            },
          ],
        },
      ],
    },
  ],
  { basename: HOST.basename }
);

/**
 * Feeds the theme state that `<RialtoProvider persistTheme>` owns (storage
 * key, live OS tracking) into this app's ThemeContext. Must render inside
 * the provider.
 */
function ThemeBridge({ children }: { children: ReactNode }) {
  const themeState = useThemeState();
  return <ThemeContext.Provider value={themeState}>{children}</ThemeContext.Provider>;
}

/** App text (i18next) and Rialto's built-in text follow the same locale. */
function LocaleProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={localeRuntime.i18n}>
      <LocaleBridge>{children}</LocaleBridge>
    </I18nextProvider>
  );
}

function Root() {
  if (!authConfigResult.valid) {
    return (
      <RialtoProvider persistTheme>
        <LocaleProviders>
          <ThemeBridge>
            <AuthConfigError missing={authConfigResult.missing} />
          </ThemeBridge>
        </LocaleProviders>
      </RialtoProvider>
    );
  }

  return (
    <RialtoProvider persistTheme>
      <LocaleProviders>
        <ThemeBridge>
          <ToastLocaleOverride>
            <ErrorBoundary onError={handleErrorBoundary}>
              <AuthProvider config={authConfigResult.config}>
                <QueryProvider>
                  <RouterProvider router={router} />
                </QueryProvider>
              </AuthProvider>
            </ErrorBoundary>
          </ToastLocaleOverride>
        </ThemeBridge>
      </LocaleProviders>
    </RialtoProvider>
  );
}

// Resolve the locale before first paint so text never flashes from en-US.
// bootLocale never rejects; a failed load just stays in en-US.
void localeRuntime.bootLocale().then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  )
);

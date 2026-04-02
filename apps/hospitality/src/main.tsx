import "@mbe/rialto/styles";
import "./index.css";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RialtoProvider, ErrorBoundary, ToastProvider } from "@mbe/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { ThemeContext, useThemeState } from "./hooks/use-theme";
import { App, CallbackRedirect } from "./App";
import { AuthConfigError } from "./components/AuthConfigError";
import { LoadingPage } from "./pages/LoadingPage";
import { validateAuthConfig } from "./constants/auth";

// Lazy-loaded route components — each becomes its own chunk
const DashboardLayout = lazy(() =>
  import("./components/DashboardLayout.js").then((m) => ({ default: m.DashboardLayout }))
);
const HomePage = lazy(() =>
  import("./pages/HomePage.js").then((m) => ({ default: m.HomePage }))
);
const ReservationsPage = lazy(() =>
  import("./pages/ReservationsPage.js").then((m) => ({ default: m.ReservationsPage }))
);
const TimelinePage = lazy(() =>
  import("./pages/TimelinePage.js").then((m) => ({ default: m.TimelinePage }))
);
const GuestsPage = lazy(() =>
  import("./pages/GuestsPage.js").then((m) => ({ default: m.GuestsPage }))
);
const FloorPlansPage = lazy(() =>
  import("./pages/FloorPlansPage.js").then((m) => ({ default: m.FloorPlansPage }))
);
const FloorPlanEditorPage = lazy(() =>
  import("./pages/FloorPlanEditorPage.js").then((m) => ({ default: m.FloorPlanEditorPage }))
);
const BookingWidgetDemoPage = lazy(() =>
  import("./pages/BookingWidgetDemoPage.js").then((m) => ({ default: m.BookingWidgetDemoPage }))
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
  import("./pages/VenueOnboardingPage.js").then((m) => ({ default: m.VenueOnboardingPage }))
);

// Validate auth config at startup — fail fast with a user-friendly error
const authConfigResult = validateAuthConfig();

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
 */
const router = createBrowserRouter(
  [
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        {
          element: (
            <Suspense fallback={<LoadingPage />}>
              <DashboardLayout />
            </Suspense>
          ),
          children: [
            {
              index: true,
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
              path: "timeline",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <TimelinePage />
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
              path: "booking-widget",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <BookingWidgetDemoPage />
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
                <Suspense fallback={<LoadingPage />}>
                  <AdminPage />
                </Suspense>
              ),
            },
            {
              path: "onboarding",
              element: (
                <Suspense fallback={<LoadingPage />}>
                  <VenueOnboardingPage />
                </Suspense>
              ),
            },
            { path: "*", element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: "/hospitality" }
);

/**
 * Wrapper that reads the persisted theme preference from localStorage
 * and passes it to RialtoProvider. Wrapped in its own component so the
 * `useThemeState` hook can live inside the React tree.
 */
function Root() {
  const themeState = useThemeState();

  if (!authConfigResult.valid) {
    return (
      <ThemeContext.Provider value={themeState}>
        <RialtoProvider theme={themeState.theme}>
          <AuthConfigError missing={authConfigResult.missing} />
        </RialtoProvider>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeState}>
      <RialtoProvider theme={themeState.theme}>
        <ToastProvider>
          <ErrorBoundary>
            <AuthProvider config={authConfigResult.config}>
              <RouterProvider router={router} />
            </AuthProvider>
          </ErrorBoundary>
        </ToastProvider>
      </RialtoProvider>
    </ThemeContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

import "@mbe/rialto/styles";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RialtoProvider, ErrorBoundary } from "@mbe/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { ThemeContext, useThemeState } from "./hooks/use-theme";
import { App, CallbackRedirect } from "./App";
import { AuthConfigError } from "./components/AuthConfigError";
import { DashboardLayout } from "./components/DashboardLayout";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { GuestsPage } from "./pages/GuestsPage";
import { FloorPlansPage } from "./pages/FloorPlansPage";
import { FloorPlanEditorPage } from "./pages/FloorPlanEditorPage";
import { BookingWidgetDemoPage } from "./pages/BookingWidgetDemoPage";
import { TimelinePage } from "./pages/TimelinePage";
import { VenueOnboardingPage } from "./pages/VenueOnboardingPage";
import { validateAuthConfig } from "./constants/auth";

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
          element: <DashboardLayout />,
          children: [
            { index: true, element: <HomePage /> },
            { path: "reservations", element: <ReservationsPage /> },
            { path: "timeline", element: <TimelinePage /> },
            { path: "guests", element: <GuestsPage /> },
            { path: "floor-plans", element: <FloorPlansPage /> },
            { path: "floor-plans/:id", element: <FloorPlanEditorPage /> },
            { path: "booking-widget", element: <BookingWidgetDemoPage /> },
            { path: "profile", element: <ProfilePage /> },
            { path: "settings", element: <SettingsPage /> },
            { path: "admin", element: <AdminPage /> },
            { path: "onboarding", element: <VenueOnboardingPage /> },
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
        <ErrorBoundary>
          <AuthProvider config={authConfigResult.config}>
            <RouterProvider router={router} />
          </AuthProvider>
        </ErrorBoundary>
      </RialtoProvider>
    </ThemeContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

import "@mbe/rialto/styles";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { AuthProvider } from "@mbe/auth/react";
import { App, CallbackRedirect } from "./App";
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

// Auth config from environment
const authConfig = {
  authority: import.meta.env.VITE_AUTH_AUTHORITY ?? "",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "",
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? window.location.origin + "/hospitality/callback",
  audience: import.meta.env.VITE_AUTH_AUDIENCE,
};

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
            { path: "*", element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: "/hospitality" }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RialtoProvider theme="light">
      <AuthProvider config={authConfig}>
        <RouterProvider router={router} />
      </AuthProvider>
    </RialtoProvider>
  </StrictMode>
);

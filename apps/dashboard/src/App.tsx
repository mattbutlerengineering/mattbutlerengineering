import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { DashboardLayout } from "./components/DashboardLayout";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { LoadingPage } from "./pages/LoadingPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { GuestsPage } from "./pages/GuestsPage";
import { FloorPlansPage } from "./pages/FloorPlansPage";
import { FloorPlanEditorPage } from "./pages/FloorPlanEditorPage";
import { BookingWidgetDemoPage } from "./pages/BookingWidgetDemoPage";
import { TimelinePage } from "./pages/TimelinePage";

export function App() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!isAuthenticated) {
    return <LoginPrompt />;
  }

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<HomePage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="floor-plans" element={<FloorPlansPage />} />
        <Route path="floor-plans/:id" element={<FloorPlanEditorPage />} />
        <Route path="booking-widget" element={<BookingWidgetDemoPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600 mb-6">Please sign in to continue</p>
        <button
          onClick={() => signIn()}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}

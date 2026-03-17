import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stack, Text, Button } from "@mbe/rialto";
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
import styles from "./App.module.css";

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
      <Route path="callback" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LoginPrompt() {
  const { signIn } = useAuth();

  return (
    <div className={styles.loginContainer}>
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">
          Hospitality
        </Text>
        <Text variant="body" color="secondary">
          Please sign in to continue
        </Text>
        <Button variant="primary" onClick={() => signIn()}>
          Sign In
        </Button>
      </Stack>
    </div>
  );
}

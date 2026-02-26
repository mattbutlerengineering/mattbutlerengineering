/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { Spinner, ToastProvider } from "@mbe/rialto";

/* ── Lazy-loaded pages ───────────────────────── */
const App = lazy(() => import("./showcase/App").then((m) => ({ default: m.App })));
const SignIn = lazy(() => import("./pages/auth/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./pages/auth/SignUp").then((m) => ({ default: m.SignUp })));
const Dashboard = lazy(() =>
  import("./pages/dashboard/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const DriverProvider = lazy(() =>
  import("./pages/drivers/DriverProvider").then((m) => ({
    default: m.DriverProvider,
  }))
);
const DriverList = lazy(() =>
  import("./pages/drivers/DriverList").then((m) => ({
    default: m.DriverList,
  }))
);
const DriverCreate = lazy(() =>
  import("./pages/drivers/DriverCreate").then((m) => ({
    default: m.DriverCreate,
  }))
);
const DriverRead = lazy(() =>
  import("./pages/drivers/DriverRead").then((m) => ({
    default: m.DriverRead,
  }))
);
const DriverUpdate = lazy(() =>
  import("./pages/drivers/DriverUpdate").then((m) => ({
    default: m.DriverUpdate,
  }))
);
const TeamCreate = lazy(() =>
  import("./pages/teams/TeamCreate").then((m) => ({
    default: m.TeamCreate,
  }))
);
const VisualTest = lazy(() =>
  import("./pages/visual-test/VisualTest").then((m) => ({
    default: m.VisualTest,
  }))
);
const LayoutDemo = lazy(() =>
  import("./pages/layouts/LayoutDemo").then((m) => ({
    default: m.LayoutDemo,
  }))
);
const DemoLayout = lazy(() =>
  import("./layouts/DemoLayout").then((m) => ({ default: m.DemoLayout }))
);

/* ── Shared fallback ─────────────────────────── */
const pageLoading = (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
    }}
  >
    <Spinner size="lg" label="Loading…" />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/rialto">
      <ToastProvider>
        <Suspense fallback={pageLoading}>
          <Routes>
            <Route path="/" element={<App />} />
            <Route element={<DemoLayout />}>
              <Route path="/login" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/teams/new" element={<TeamCreate />} />
              <Route path="/layouts" element={<LayoutDemo />} />
              <Route path="/visual-test" element={<VisualTest />} />
              <Route element={<DriverProvider />}>
                <Route path="/drivers" element={<DriverList />} />
                <Route path="/drivers/new" element={<DriverCreate />} />
                <Route path="/drivers/:id" element={<DriverRead />} />
                <Route path="/drivers/:id/edit" element={<DriverUpdate />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);

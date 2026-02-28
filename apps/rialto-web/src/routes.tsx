/* eslint-disable react-refresh/only-export-components -- route module, not a fast-refresh module */
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Spinner, Text } from "@mbe/rialto";
import { NAV_SECTIONS } from "./data/nav-sections";

/* ── Lazy-loaded demo pages ──────────────────── */
const SignIn = lazy(() => import("./pages/auth/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./pages/auth/SignUp").then((m) => ({ default: m.SignUp })));
const Dashboard = lazy(() =>
  import("./pages/dashboard/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const DriverProvider = lazy(() =>
  import("./pages/drivers/DriverProvider").then((m) => ({ default: m.DriverProvider }))
);
const DriverList = lazy(() =>
  import("./pages/drivers/DriverList").then((m) => ({ default: m.DriverList }))
);
const DriverCreate = lazy(() =>
  import("./pages/drivers/DriverCreate").then((m) => ({ default: m.DriverCreate }))
);
const DriverRead = lazy(() =>
  import("./pages/drivers/DriverRead").then((m) => ({ default: m.DriverRead }))
);
const DriverUpdate = lazy(() =>
  import("./pages/drivers/DriverUpdate").then((m) => ({ default: m.DriverUpdate }))
);
const TeamCreate = lazy(() =>
  import("./pages/teams/TeamCreate").then((m) => ({ default: m.TeamCreate }))
);
const VisualTest = lazy(() =>
  import("./pages/visual-test/VisualTest").then((m) => ({ default: m.VisualTest }))
);
const LayoutDemo = lazy(() =>
  import("./pages/layouts/LayoutDemo").then((m) => ({ default: m.LayoutDemo }))
);
const DemoLayout = lazy(() =>
  import("./layouts/DemoLayout").then((m) => ({ default: m.DemoLayout }))
);
const ShowcaseLayout = lazy(() =>
  import("./layouts/ShowcaseLayout").then((m) => ({ default: m.ShowcaseLayout }))
);
const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage }))
);

/* ── Shared loading fallback ─────────────────── */
const pageLoading = (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
    }}
  >
    <Spinner size="lg" label="Loading..." />
  </div>
);

/* ── Placeholder for component pages (filled in Plan 02) ── */
function PlaceholderPage({ name }: { name: string }) {
  return (
    <div style={{ padding: "var(--rialto-space-xl)" }}>
      <Text variant="display" color="primary">
        {name}
      </Text>
      <Text variant="caption" color="secondary">
        Coming soon...
      </Text>
    </div>
  );
}

/* ── Route props ─────────────────────────────── */
export interface ShowcaseRouterProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

/**
 * All route definitions for the rialto-web showcase app.
 *
 * Structure:
 * - ShowcaseLayout wraps the overview + all component pages (/ and /components/*)
 * - DemoLayout wraps the full-page demo pages (/demos/*)
 * - A standalone /visual-test route (hidden from sidebar)
 */
export function ShowcaseRouter({ theme, onThemeToggle }: ShowcaseRouterProps) {
  return (
    <Suspense fallback={pageLoading}>
      <Routes>
        {/* ── Showcase shell ──────────────────── */}
        <Route element={<ShowcaseLayout theme={theme} onThemeToggle={onThemeToggle} />}>
          {/* Overview landing page */}
          <Route index element={<OverviewPage />} />

          {/* Component pages — generated from nav sections (Plan 02 replaces placeholders) */}
          {NAV_SECTIONS.flatMap((section) =>
            section.items.map((item) => (
              <Route
                key={item.id}
                path={item.path}
                element={<PlaceholderPage name={item.label} />}
              />
            ))
          )}
        </Route>

        {/* ── Demo pages ──────────────────────── */}
        <Route element={<DemoLayout />}>
          <Route path="/demos/login" element={<SignIn />} />
          <Route path="/demos/signup" element={<SignUp />} />
          <Route path="/demos/dashboard" element={<Dashboard />} />
          <Route path="/demos/teams/new" element={<TeamCreate />} />
          <Route path="/demos/layouts" element={<LayoutDemo />} />
          <Route path="/demos/visual-test" element={<VisualTest />} />
          <Route element={<DriverProvider />}>
            <Route path="/demos/drivers" element={<DriverList />} />
            <Route path="/demos/drivers/new" element={<DriverCreate />} />
            <Route path="/demos/drivers/:id" element={<DriverRead />} />
            <Route path="/demos/drivers/:id/edit" element={<DriverUpdate />} />
          </Route>
        </Route>

        {/* ── Standalone visual-test (not in sidebar) ── */}
        <Route path="/visual-test" element={<VisualTest />} />
      </Routes>
    </Suspense>
  );
}

ShowcaseRouter.displayName = "ShowcaseRouter";

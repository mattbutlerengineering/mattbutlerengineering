import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { Spinner, Text } from "@mattbutlerengineering/rialto";
import { ShowcaseLayout } from "./layouts/ShowcaseLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PAGE_REGISTRY } from "./data/page-registry";

/* ── Lazy-loaded demo pages ──────────────────────── */
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

/* ── Shared loading fallback ─────────────────── */
function PageLoading() {
  return (
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
}

/** Wrap a lazy component with Suspense */
function suspended(Component: React.LazyExoticComponent<React.ComponentType>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

/** Token placeholder page */
function tokenPlaceholder(name: string) {
  return (
    <div style={{ padding: "var(--rialto-space-xl)" }}>
      <Text color="tertiary">{name} — coming soon</Text>
    </div>
  );
}

/* ── Token placeholder labels — comingSoon entries have no component ── */
const TOKEN_PLACEHOLDER_LABELS: Record<string, string> = {
  motion: "Motion tokens",
  typography: "Typography tokens",
  color: "Color tokens",
  spacing: "Spacing tokens",
  radius: "Radius tokens",
  shadows: "Shadow tokens",
  surfaces: "Surface tokens",
  "icon-vocabulary": "Icon vocabulary",
};

/* ── Component routes derived from PAGE_REGISTRY ── */
const componentRoutes: RouteObject[] = PAGE_REGISTRY.map((entry) => {
  // Strip the leading slash to get the relative path for React Router
  const relativePath = entry.path.replace(/^\//, "");

  if (entry.comingSoon && entry.id in TOKEN_PLACEHOLDER_LABELS) {
    return {
      path: relativePath,
      element: tokenPlaceholder(TOKEN_PLACEHOLDER_LABELS[entry.id]!),
    };
  }

  const LazyPage = lazy(entry.load as () => Promise<{ default: React.ComponentType }>);

  return {
    path: relativePath,
    element: suspended(LazyPage),
  };
});

/**
 * Route tree for createBrowserRouter.
 * Uses the v7 data router API which correctly handles basename on deep links.
 *
 * Only ONE pathless layout route (ShowcaseLayout) exists at the top level.
 * DemoLayout uses an explicit `path: "demos"` to avoid ambiguous route matching
 * in React Router v7 when multiple pathless layouts compete at the same level.
 */
export const routeTree: RouteObject[] = [
  // Showcase shell (sidebar + header) — eagerly imported to avoid double lazy-load waterfall on /rialto
  {
    element: <ShowcaseLayout />,
    children: [{ index: true, element: <OverviewPage /> }, ...componentRoutes],
  },
  // Demo pages — explicit "demos" path prefix avoids pathless layout ambiguity
  {
    path: "demos",
    element: suspended(DemoLayout),
    children: [
      { path: "login", element: suspended(SignIn) },
      { path: "signup", element: suspended(SignUp) },
      { path: "dashboard", element: suspended(Dashboard) },
      { path: "teams/new", element: suspended(TeamCreate) },
      { path: "layouts", element: suspended(LayoutDemo) },
      { path: "visual-test", element: suspended(VisualTest) },
      {
        element: suspended(DriverProvider),
        children: [
          { path: "drivers", element: suspended(DriverList) },
          { path: "drivers/new", element: suspended(DriverCreate) },
          { path: "drivers/:id", element: suspended(DriverRead) },
          { path: "drivers/:id/edit", element: suspended(DriverUpdate) },
        ],
      },
    ],
  },
  // Standalone visual-test
  { path: "visual-test", element: suspended(VisualTest) },
  // Privacy policy
  { path: "privacy", element: <PrivacyPage /> },
  // Catch-all
  { path: "*", element: <Navigate to="/" replace /> },
];

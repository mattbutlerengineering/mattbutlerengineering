import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router";
import { Spinner } from "@mattbutlerengineering/rialto";
import { ShowcaseLayout } from "./layouts/ShowcaseLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { DemosIndexPage } from "./pages/DemosIndexPage";
import { PAGE_REGISTRY } from "./data/page-registry";
import { DocumentTitle } from "./document-title";
import { RouteHead } from "./route-head";

/* ── Lazy-loaded demo pages ──────────────────────── */
const SignIn = lazy(() => import("./pages/auth/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./pages/auth/SignUp").then((m) => ({ default: m.SignUp })));
const SessionExpired = lazy(() =>
  import("./pages/auth/SessionExpired").then((m) => ({ default: m.SessionExpired }))
);
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
const Telemetry = lazy(() =>
  import("./pages/telemetry/Telemetry").then((m) => ({ default: m.Telemetry }))
);
const AuthFlowPage = lazy(() =>
  import("./pages/auth/AuthFlowPage").then((m) => ({ default: m.AuthFlowPage }))
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

/** A route element that also titles the tab (component pages title themselves). */
function titled(title: string, element: React.ReactNode) {
  return (
    <>
      <DocumentTitle title={title} />
      {element}
    </>
  );
}

/* ── Component routes derived from PAGE_REGISTRY ── */
const componentRoutes: RouteObject[] = PAGE_REGISTRY.map((entry) => {
  // Strip the leading slash to get the relative path for React Router
  const relativePath = entry.path.replace(/^\//, "");

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
 * RouteHead is the only top-level pathless layout. ShowcaseLayout is the only
 * pathless route among its siblings; DemoLayout uses an explicit `path: "demos"`
 * so two pathless layouts never compete at the same level (React Router v7).
 */
export const routeTree: RouteObject[] = [
  {
    element: <RouteHead />,
    children: [
      // Showcase shell (sidebar + header) — eagerly imported to avoid double lazy-load waterfall on /rialto
      {
        element: <ShowcaseLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          // Demos index lives in the showcase shell (sidebar + footer, #8641); the
          // demo pages themselves stay full-page under DemoLayout.
          { path: "demos", element: titled("Demos", <DemosIndexPage />) },
          ...componentRoutes,
        ],
      },
      // Demo pages — explicit "demos" path prefix avoids pathless layout ambiguity
      {
        path: "demos",
        element: suspended(DemoLayout),
        children: [
          { path: "login", element: titled("Sign In", suspended(SignIn)) },
          { path: "signup", element: titled("Sign Up", suspended(SignUp)) },
          {
            path: "session-expired",
            element: titled("Session Expired", suspended(SessionExpired)),
          },
          { path: "dashboard", element: titled("Pit Wall", suspended(Dashboard)) },
          { path: "teams/new", element: titled("Team Create", suspended(TeamCreate)) },
          { path: "layouts", element: titled("Layout Demo", suspended(LayoutDemo)) },
          { path: "telemetry", element: titled("Telemetry HUD", suspended(Telemetry)) },
          { path: "auth-flow", element: titled("Auth Flow", suspended(AuthFlowPage)) },
          { path: "visual-test", element: titled("Visual Test", suspended(VisualTest)) },
          {
            element: suspended(DriverProvider),
            children: [
              { path: "drivers", element: titled("Drivers CRUD", suspended(DriverList)) },
              { path: "drivers/new", element: titled("New Driver", suspended(DriverCreate)) },
              { path: "drivers/:id", element: titled("Driver", suspended(DriverRead)) },
              { path: "drivers/:id/edit", element: titled("Edit Driver", suspended(DriverUpdate)) },
            ],
          },
        ],
      },
      // Standalone visual-test
      {
        path: "visual-test",
        element: (
          <main>
            <DocumentTitle title="Visual Test" />
            {suspended(VisualTest)}
          </main>
        ),
      },
      // Privacy policy
      { path: "privacy", element: titled("Privacy Policy", <PrivacyPage />) },
      // Catch-all: unknown URLs get a not-found page (title comes from RouteHead)
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

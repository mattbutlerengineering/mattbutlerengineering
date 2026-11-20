import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { Footer, GlobalNav, Skeleton, Text } from "@mattbutlerengineering/rialto";
import { engineeringMenu, siteCopyright, siteFooterColumns } from "@mbe/site-nav";
import { useRouteMeta } from "./utils/route-meta";
import styles from "./App.module.css";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const StatusPage = lazy(() =>
  import("./pages/StatusPage").then((m) => ({ default: m.StatusPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);
const MetricsPage = lazy(() =>
  import("./pages/MetricsPage").then((m) => ({ default: m.MetricsPage }))
);
const AcmmPage = lazy(() => import("./pages/AcmmPage").then((m) => ({ default: m.AcmmPage })));
const AiHealthPage = lazy(() =>
  import("./pages/AiHealthPage").then((m) => ({ default: m.AiHealthPage }))
);
const ShippedIndexPage = lazy(() =>
  import("./pages/ShippedIndexPage").then((m) => ({ default: m.ShippedIndexPage }))
);
const ShippedStoryPage = lazy(() =>
  import("./pages/ShippedStoryPage").then((m) => ({ default: m.ShippedStoryPage }))
);
const VenuesPage = lazy(() =>
  import("./pages/VenuesPage").then((m) => ({ default: m.VenuesPage }))
);

interface AppProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

// Reserves the height HeroSection commits to (minHeight="90vh") for the
// duration of HomePage's lazy-chunk fetch, so the footer never paints
// in-viewport only to be shoved off-screen once the real content mounts
// (#4835 — measured CLS 0.28, single shift sourced from the footer).
function HomeRouteFallback() {
  return <Skeleton variant="rect" width="100%" height="90vh" />;
}

// Outer Suspense fallback for every non-home route: without it the main area
// is blank until the page's lazy chunk arrives (#8640).
function RouteFallback() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading page">
      <Skeleton variant="rect" width="100%" height="60vh" />
    </div>
  );
}

export function App({ theme, onThemeToggle }: AppProps) {
  useRouteMeta();
  const { pathname } = useLocation();
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main && !window.location.hash) {
      main.focus({ preventScroll: true });
    }
  }, []);

  return (
    <div className={styles.layout}>
      <noscript>
        <style>{`
          #main-content [style*="opacity"] {
            opacity: 1 !important;
            transform: none !important;
          }
        `}</style>
      </noscript>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <GlobalNav
        currentApp="marketing"
        currentPath={pathname}
        theme={theme}
        onThemeToggle={onThemeToggle}
        menu={engineeringMenu(pathname)}
      />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={<HomeRouteFallback />}>
                  <HomePage />
                </Suspense>
              }
            />
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/weekly" element={<Navigate to="/" replace />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/acmm" element={<AcmmPage />} />
            <Route path="/ai-health" element={<AiHealthPage />} />
            <Route path="/shipped" element={<ShippedIndexPage />} />
            <Route path="/shipped/:slug" element={<ShippedStoryPage />} />
            <Route path="/venues" element={<VenuesPage />} />
            {/* Fallback for edge router failure or local dev */}
            <Route path="/rialto/*" element={<Navigate to="/rialto/" replace />} />
            <Route path="/hospitality/*" element={<Navigate to="/hospitality/" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer
        variant="rich"
        className={styles.footer}
        logo={<Text>MBE</Text>}
        columns={siteFooterColumns()}
        copyright={siteCopyright(CURRENT_YEAR)}
      />
    </div>
  );
}

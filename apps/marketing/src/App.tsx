import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Footer, GlobalNav, Text } from "@mattbutlerengineering/rialto";
import styles from "./App.module.css";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const StatusPage = lazy(() =>
  import("./pages/StatusPage").then((m) => ({ default: m.StatusPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);
const WeeklyIntakePage = lazy(() =>
  import("./pages/WeeklyIntakePage").then((m) => ({ default: m.WeeklyIntakePage }))
);
const MetricsPage = lazy(() =>
  import("./pages/MetricsPage").then((m) => ({ default: m.MetricsPage }))
);

interface AppProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

export function App({ theme, onThemeToggle }: AppProps) {
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
      <GlobalNav currentApp="marketing" theme={theme} onThemeToggle={onThemeToggle} />
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/weekly" element={<WeeklyIntakePage />} />
            <Route path="/metrics" element={<MetricsPage />} />
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
        columns={[
          {
            title: "Projects",
            links: [
              { label: "Rialto Design System", href: "/rialto/" },
              { label: "Hospitality Platform", href: "/hospitality/" },
            ],
          },
          {
            title: "Connect",
            links: [
              { label: "GitHub", href: "https://github.com/mattbutlerengineering" },
              { label: "LinkedIn", href: "https://www.linkedin.com/in/matt-butler-66496a68/" },
              { label: "Email", href: "mailto:mattbutlerengineering+webapp@gmail.com" },
            ],
          },
        ]}
        copyright={`\u00A9 ${CURRENT_YEAR} Matt Butler Engineering`}
      />
    </div>
  );
}

import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Footer, GlobalNav } from "@mbe/rialto";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import styles from "./App.module.css";

interface AppProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer
        variant="rich"
        className={styles.footer}
        logo={<span>MBE</span>}
        columns={[
          {
            title: "Projects",
            links: [
              { label: "Rialto Design System", href: "/rialto" },
              { label: "Hospitality Platform", href: "/hospitality" },
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
        copyright={`\u00A9 ${new Date().getFullYear()} Matt Butler Engineering`}
      />
    </div>
  );
}

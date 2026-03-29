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
  return (
    <div className={styles.layout}>
      <GlobalNav currentApp="marketing" theme={theme} onThemeToggle={onThemeToggle} />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer variant="minimal" className={styles.footer}>
        <span>&copy; {new Date().getFullYear()} Matt Butler Engineering</span>
      </Footer>
    </div>
  );
}

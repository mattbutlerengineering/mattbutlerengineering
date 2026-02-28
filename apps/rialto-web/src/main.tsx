/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { RialtoProvider, ToastProvider } from "@mbe/rialto";
import { ShowcaseRouter } from "./routes";

/* ── Theme initialization ─────────────────────── */
function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("rialto-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/* ── Root component ───────────────────────────── */
function Root() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  // Persist theme choice on change
  useEffect(() => {
    localStorage.setItem("rialto-theme", theme);
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  return (
    // RialtoProvider MUST wrap BrowserRouter (outside it)
    <RialtoProvider theme={theme}>
      <BrowserRouter basename="/rialto">
        <ToastProvider>
          <ShowcaseRouter theme={theme} onThemeToggle={handleThemeToggle} />
        </ToastProvider>
      </BrowserRouter>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import { StrictMode, useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "@mbe/rialto/styles";
import "./global.css";
import { RialtoProvider, ToastProvider } from "@mbe/rialto";
import { ThemeContext } from "./ThemeContext";
import { routeTree } from "./routes";

/* ── Theme initialization ─────────────────────── */
function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("rialto-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Uses createBrowserRouter (React Router v7 recommended API) instead of
 * BrowserRouter to ensure basename is correctly applied on deep links.
 */
const router = createBrowserRouter(routeTree, { basename: "/rialto" });

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

  const themeContextValue = useMemo(
    () => ({ theme, onThemeToggle: handleThemeToggle }),
    [theme]
  );

  return (
    // RialtoProvider MUST wrap RouterProvider (outside it)
    <RialtoProvider theme={theme}>
      <ThemeContext value={themeContextValue}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeContext>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

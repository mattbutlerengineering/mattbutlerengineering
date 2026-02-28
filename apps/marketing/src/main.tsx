/* eslint-disable react-refresh/only-export-components -- entry point, not a fast-refresh module */
import "@mbe/rialto/styles";
import "./global.css";
import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { RialtoProvider } from "@mbe/rialto";
import { App } from "./App";

/* ── Theme initialization ─────────────────────── */
function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
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
      <BrowserRouter>
        <App theme={theme} onThemeToggle={handleThemeToggle} />
      </BrowserRouter>
    </RialtoProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

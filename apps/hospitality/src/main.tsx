import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@mbe/auth/react";
import { App } from "./App";
import "./index.css";

// Auth config from environment
const authConfig = {
  authority: import.meta.env.VITE_AUTH_AUTHORITY ?? "",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "",
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? window.location.origin + "/hospitality/callback",
  audience: import.meta.env.VITE_AUTH_AUDIENCE,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/hospitality">
      <AuthProvider config={authConfig}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);

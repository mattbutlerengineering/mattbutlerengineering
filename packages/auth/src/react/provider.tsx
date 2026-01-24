import { AuthProvider as OIDCProvider } from "react-oidc-context";
import type { AuthProviderProps as OIDCProviderProps } from "react-oidc-context";
import type { ReactNode } from "react";
import type { OIDCConfig } from "../types/index.js";

export interface AuthProviderProps {
  config: OIDCConfig;
  children: ReactNode;
  /** Called when sign-in completes */
  onSigninCallback?: () => void;
}

/**
 * Auth provider wrapper that configures react-oidc-context
 * Uses standard OIDC (not Auth0-specific SDK) for portability
 */
export function AuthProvider({ config, children, onSigninCallback }: AuthProviderProps) {
  const oidcConfig: OIDCProviderProps = {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri ?? config.redirectUri,
    scope: config.scope ?? "openid profile email",
    // For Auth0, we need to pass audience as extra query params
    extraQueryParams: config.audience ? { audience: config.audience } : undefined,
    onSigninCallback: () => {
      // Remove OIDC callback params from URL after sign-in
      window.history.replaceState({}, document.title, window.location.pathname);
      onSigninCallback?.();
    },
  };

  return <OIDCProvider {...oidcConfig}>{children}</OIDCProvider>;
}

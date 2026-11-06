import { AuthProvider as OIDCProvider } from "react-oidc-context";
import type { AuthProviderProps as OIDCProviderProps } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import type { User } from "oidc-client-ts";
import { useEffect, type ReactNode } from "react";
import type { OIDCConfig } from "../types/index.js";
import { extractReturnTo } from "./return-to.js";
import { rememberSigninReturnTo } from "./signin-return-to.js";
import { installAuthBackReload, installAuthBackSkip } from "./auth-history.js";
import { SessionLifecycleProvider } from "./session-lifecycle.js";

export interface AuthProviderProps {
  config: OIDCConfig;
  children: ReactNode;
  /**
   * Called when sign-in completes. Receives the validated `returnTo` path that
   * was carried through the OIDC `state` by `signIn({ returnTo })`, or
   * undefined when none was carried (or it failed open-redirect validation).
   */
  onSigninCallback?: (returnTo?: string) => void;
}

/**
 * Auth provider wrapper that configures react-oidc-context
 * Uses standard OIDC (not Auth0-specific SDK) for portability
 */
export function AuthProvider({ config, children, onSigninCallback }: AuthProviderProps) {
  useEffect(() => installAuthBackReload(), []);

  const oidcConfig: OIDCProviderProps = {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri ?? config.redirectUri,
    // offline_access makes Auth0 issue a refresh token, so signinSilent uses the
    // refresh_token grant (a fetch) instead of a prompt=none iframe, which the
    // edge CSP (frame-src, frame-ancestors 'none') blocks.
    scope: config.scope ?? "openid profile email offline_access",
    // useAccessToken owns renewal timing; a second oidc-client-ts timer would race it.
    automaticSilentRenew: false,
    // For Auth0, we need to pass audience as extra query params
    extraQueryParams: config.audience ? { audience: config.audience } : undefined,
    // Use localStorage so Playwright's storageState captures the OIDC session.
    // oidc-client-ts defaults to sessionStorage, which Playwright cannot persist.
    userStore: new WebStorageStateStore({ store: window.localStorage }),
    onSigninCallback: (user: User | undefined | void) => {
      // Remove OIDC callback params from URL after sign-in
      window.history.replaceState({}, document.title, window.location.pathname);
      // The consent page is still behind this entry. Arm a Back skip when
      // sign-in recorded how long history was before the redirect.
      installAuthBackSkip();
      const returnTo = user ? extractReturnTo(user.state) : undefined;
      rememberSigninReturnTo(returnTo);
      onSigninCallback?.(returnTo);
    },
  };

  return (
    <OIDCProvider {...oidcConfig}>
      <SessionLifecycleProvider>{children}</SessionLifecycleProvider>
    </OIDCProvider>
  );
}

/**
 * Auth0 settings for the gen playground.
 *
 * Sign-out must return to the signed-out `/gen` landing page. The OIDC
 * `post_logout_redirect_uri` defaults to the login callback (`/gen/callback`)
 * when this is unset, and that callback is a login URL, not an Allowed Logout
 * URL — Auth0 answers it with HTTP 400 ("Oops!, something went wrong") after
 * the session has already ended.
 */
export interface GenAuthEnv {
  authority?: string;
  clientId?: string;
  redirectUri?: string;
  audience?: string;
}

export interface GenAuthConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  audience?: string;
  postLogoutRedirectUri: string;
}

export function buildGenAuthConfig(env: GenAuthEnv, origin: string): GenAuthConfig {
  const redirectUri =
    env.redirectUri && env.redirectUri.trim() !== "" ? env.redirectUri : `${origin}/gen/callback`;
  // Strip only the gen callback suffix so a custom redirect that is not the
  // gen callback cannot invent a logout URL Auth0 has never been given.
  const postLogoutRedirectUri = redirectUri.endsWith("/gen/callback")
    ? redirectUri.slice(0, -"/callback".length)
    : `${origin}/gen`;
  return {
    authority: env.authority ?? "",
    clientId: env.clientId ?? "",
    redirectUri,
    audience: env.audience,
    postLogoutRedirectUri,
  };
}

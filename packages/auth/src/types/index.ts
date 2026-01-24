/**
 * OIDC configuration for Auth0 or any OIDC-compliant provider
 */
export interface OIDCConfig {
  /** OIDC authority URL (e.g., https://your-tenant.auth0.com) */
  authority: string;
  /** OAuth client ID */
  clientId: string;
  /** Redirect URI after login */
  redirectUri: string;
  /** Post-logout redirect URI */
  postLogoutRedirectUri?: string;
  /** OAuth scopes to request */
  scope?: string;
  /** Expected audience for token validation */
  audience?: string;
}

/**
 * Decoded JWT payload with standard OIDC claims
 */
export interface JWTPayload {
  /** Subject (user ID) */
  sub: string;
  /** Issuer */
  iss: string;
  /** Audience */
  aud: string | string[];
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Email (if requested in scope) */
  email?: string;
  /** Email verified flag */
  email_verified?: boolean;
  /** User's name */
  name?: string;
  /** User's picture URL */
  picture?: string;
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * Authenticated user context
 */
export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
  raw: JWTPayload;
}

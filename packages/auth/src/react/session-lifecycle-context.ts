import { createContext, use } from "react";

/**
 * Session lifecycle signals that react-oidc-context does not model.
 *
 * react-oidc-context evaluates `isAuthenticated` only when a user is loaded,
 * so a token that expires *while the app is open* leaves `isAuthenticated`
 * true and the UI none the wiser — the first symptom is a 401 from the API.
 * oidc-client-ts does emit `accessTokenExpired` for exactly this moment;
 * `SessionLifecycleProvider` subscribes to it and exposes the result here, so
 * consumers can show a deliberate "your session ended" state instead of a
 * cold login gate.
 */
export interface SessionLifecycleState {
  /** True from the moment the access token expires until a new user session loads. */
  readonly expired: boolean;
}

const DEFAULT_STATE: SessionLifecycleState = { expired: false };

export const SessionLifecycleContext = createContext<SessionLifecycleState>(DEFAULT_STATE);

/** Read the session lifecycle; returns the inert default outside a provider. */
export function useSessionLifecycle(): SessionLifecycleState {
  return use(SessionLifecycleContext);
}

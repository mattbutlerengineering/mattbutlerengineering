import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth as useOIDCAuth } from "react-oidc-context";
import { SessionLifecycleContext } from "./session-lifecycle-context.js";
import type { SessionLifecycleState } from "./session-lifecycle-context.js";

/**
 * Subscribes to oidc-client-ts's `accessTokenExpired` / `userLoaded` events and
 * publishes the derived `expired` flag through `SessionLifecycleContext`.
 * Mounted by `AuthProvider` inside the OIDC provider; see the context module
 * for why this signal exists.
 */
export function SessionLifecycleProvider({ children }: { readonly children: ReactNode }) {
  const { events } = useOIDCAuth();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // `events` is absent when react-oidc-context runs without a UserManager
    // (server render) — nothing to subscribe to.
    if (!events) return undefined;

    const handleExpired = () => setExpired(true);
    const handleLoaded = () => setExpired(false);

    events.addAccessTokenExpired(handleExpired);
    events.addUserLoaded(handleLoaded);

    return () => {
      events.removeAccessTokenExpired(handleExpired);
      events.removeUserLoaded(handleLoaded);
    };
  }, [events]);

  const value = useMemo<SessionLifecycleState>(() => ({ expired }), [expired]);

  return <SessionLifecycleContext value={value}>{children}</SessionLifecycleContext>;
}

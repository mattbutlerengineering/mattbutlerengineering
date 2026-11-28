import { useMatches } from "react-router";

/**
 * The `handle` of the router's catch-all (`path: "*"`) route. App reads it to
 * tell an unknown URL from a real protected one before the auth gate decides
 * what a signed-out visitor sees (#9990).
 */
export const NOT_FOUND_ROUTE_HANDLE: Readonly<{ notFound: true }> = Object.freeze({
  notFound: true,
});

function isNotFoundHandle(handle: unknown): boolean {
  return (
    typeof handle === "object" &&
    handle !== null &&
    (handle as { notFound?: unknown }).notFound === true
  );
}

/** True when the current URL matched no real route, only the catch-all. Needs a data router. */
export function useIsNotFoundRoute(): boolean {
  return useMatches().some((match) => isNotFoundHandle(match.handle));
}

import type { JSX } from "react";
import { useAuth } from "@mbe/auth/react";
import { Button, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import { describeAuthError } from "../lib/describe-auth-error.js";
import styles from "./AuthFailurePage.module.css";

/** The parties to an OIDC sign-in, in the order the credential travels. */
const STATIONS = ["Browser", "Identity", "API"] as const;

/**
 * Renders a failed code exchange in place, on the same machined stage as
 * `LoginGate` / `SessionExpiredGate`, instead of today's plain text error
 * page. `describeAuthError` supplies the category copy; a retry is offered
 * only where `canRetry`, and the raw message stays reachable under a
 * collapsed "Technical details" for debugging.
 *
 * `signIn()` is called with no options — the `@mbe/auth` `returnTo` rule
 * means retry goes home rather than back to the pre-failure deep link,
 * because oidc-client-ts removes the stored state entry before the token
 * exchange completes.
 *
 * While the retry redirect is in flight (`activeNavigator === "signinRedirect"`)
 * the Handshake and status line switch to a negotiating variant; the title
 * and body stay put so nothing jumps.
 */
export function AuthFailurePage({ error, lane }: { error: Error; lane: 0 | 1 }): JSX.Element {
  const { signIn, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";
  const described = describeAuthError(error);

  return (
    <div className={styles.gate} data-testid="auth-failure">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          {inFlight ? (
            <Handshake
              className={styles.handshake}
              aria-label="Connecting your browser to Identity"
              stations={STATIONS}
              state="negotiating"
              lane={0}
              size="lg"
            />
          ) : (
            <Handshake
              className={styles.handshake}
              aria-label="Your sign-in could not be verified"
              stations={STATIONS}
              state="failed"
              lane={lane}
              size="lg"
            />
          )}

          <div role="status" aria-live="polite">
            <Text variant="caption" color="tertiary">
              {inFlight ? "Starting a fresh sign-in" : "The exchange didn't go through"}
            </Text>
          </div>

          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {described.title}
            </Text>
            <Text variant="body" color="secondary">
              {described.body}
            </Text>
          </Stack>

          {described.canRetry && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => signIn()}
              isLoading={inFlight}
              loadingText="Heading to sign-in"
            >
              Try again
            </Button>
          )}

          <details className={styles.errorDetails}>
            <summary>Technical details</summary>
            <Text variant="caption" color="tertiary">
              {error.message}
            </Text>
          </details>
        </Stack>
      </div>
    </div>
  );
}

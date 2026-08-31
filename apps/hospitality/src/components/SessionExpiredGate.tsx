import { useAuth } from "@mbe/auth/react";
import { Button, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import { SESSION_LAPSE_COPY } from "../constants/session-lapse-copy.js";
import styles from "./SessionExpiredGate.module.css";

const STATIONS = ["Browser", "Identity"] as const;

/**
 * Rendered in place of the dashboard once the access token has lapsed
 * (`useAuth().sessionExpired`). A deliberate "your session ended" moment
 * instead of a cold login gate: the Handshake sits dark until the user asks
 * to reconnect, then lights up for the redirect.
 *
 * `signIn()` with no options derives `returnTo` from the current location
 * (see `@mbe/auth` deriveReturnTo), so the page they were on is restored
 * after the round-trip.
 */
export function SessionExpiredGate() {
  const { signIn, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";

  return (
    <div className={styles.gate} data-testid="session-expired">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          <Handshake
            className={styles.handshake}
            aria-label="Session with Identity has lapsed"
            stations={STATIONS}
            state={inFlight ? "negotiating" : "idle"}
            size="lg"
          />

          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {SESSION_LAPSE_COPY.heading}
            </Text>
            <Text variant="body" color="secondary">
              {SESSION_LAPSE_COPY.body}
            </Text>
          </Stack>

          <Button
            variant="primary"
            size="lg"
            onClick={() => signIn()}
            isLoading={inFlight}
            loadingText={SESSION_LAPSE_COPY.actionBusy}
          >
            {SESSION_LAPSE_COPY.action}
          </Button>
        </Stack>
      </div>
    </div>
  );
}

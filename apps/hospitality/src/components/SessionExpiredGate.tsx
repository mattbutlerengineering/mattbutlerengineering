import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import { Button, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import { getSessionLapseCopy } from "../constants/session-lapse-copy.js";
import styles from "./SessionExpiredGate.module.css";

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
  const { t } = useTranslation();
  const { signIn, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";
  const copy = getSessionLapseCopy(t);
  const stations = [t("auth.stations.browser"), t("auth.stations.identity")] as const;

  return (
    <div className={styles.gate} data-testid="session-expired">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          <Handshake
            className={styles.handshake}
            aria-label={t("auth.sessionLapse.label")}
            stations={stations}
            state={inFlight ? "negotiating" : "idle"}
            size="lg"
          />

          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {copy.heading}
            </Text>
            <Text variant="body" color="secondary">
              {copy.body}
            </Text>
          </Stack>

          <Button
            variant="primary"
            size="lg"
            onClick={() => signIn()}
            isLoading={inFlight}
            loadingText={copy.actionBusy}
          >
            {copy.action}
          </Button>
        </Stack>
      </div>
    </div>
  );
}

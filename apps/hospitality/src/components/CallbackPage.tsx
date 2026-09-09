import { Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./CallbackPage.module.css";

/** The parties to an OIDC sign-in, in the order the credential travels. */
const STATIONS = ["Browser", "Identity", "API"] as const;

/**
 * Shown on `/callback` while react-oidc-context exchanges the authorization
 * code for tokens. The Handshake instrument replaces the generic watch loader
 * so the wait reads as what it is — a credential moving between named
 * parties — and lane 1 (Identity → API) says which leg is in flight.
 *
 * The polite status line is a separate sentence from the image label so a
 * screen reader hears the step once, not twice.
 */
export function CallbackPage() {
  return (
    <div className={styles.container} data-testid="callback-page">
      <Stack gap="lg" align="center">
        <Handshake
          className={styles.handshake}
          aria-label="Verifying your sign-in"
          stations={STATIONS}
          state="negotiating"
          lane={1}
          size="lg"
        />
        <div role="status" aria-live="polite">
          <Text variant="caption" color="tertiary">
            Exchanging your code for a session
          </Text>
        </div>
      </Stack>
    </div>
  );
}

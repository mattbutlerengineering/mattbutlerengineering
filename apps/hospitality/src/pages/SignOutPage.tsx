import { Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./SignOutPage.module.css";

/** The parties to a sign-out, in the order the session teardown travels. */
const STATIONS = ["Browser", "Identity"] as const;

/**
 * Shown while `useAuth()` keeps `isLoading` true during the sign-out
 * navigator (`activeNavigator === "signoutRedirect"`), before the browser
 * leaves for Auth0's end-session endpoint. The sign-out analogue of
 * `CallbackPage` — a Handshake replaces the generic watch loader so the wait
 * reads as what it is, a session being torn down between named parties.
 *
 * The polite status line is a separate sentence from the image label so a
 * screen reader hears the step once, not twice. There is no resting form or
 * timeout to design: the browser navigates away as soon as Auth0 responds.
 */
export function SignOutPage() {
  return (
    <div className={styles.container} data-testid="sign-out-page">
      <Stack gap="lg" align="center">
        <Handshake
          className={styles.handshake}
          aria-label="Ending your session with Identity"
          stations={STATIONS}
          state="negotiating"
          lane={0}
          size="lg"
        />
        <div role="status" aria-live="polite">
          <Text variant="caption" color="tertiary">
            Signing you out
          </Text>
        </div>
      </Stack>
    </div>
  );
}

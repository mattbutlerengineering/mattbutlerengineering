import { Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoadingPage.module.css";

/** The parties to a page load, in the order the request travels. */
const STATIONS = ["Browser", "Hospitality"] as const;

/**
 * Route-level loading state — the auth bootstrap and every lazy route's
 * Suspense fallback. A Handshake, the same hospitality instrument the rest of
 * the auth gate (LoginGate, CallbackPage, SessionExpiredGate, SignOutPage)
 * uses, so the boot sequence reads as one motif (#6334). Handshake handles
 * prefers-reduced-motion through the motion preset.
 *
 * The polite status line is a separate sentence from the image label so a
 * screen reader hears the wait once, not twice.
 */
export function LoadingPage() {
  return (
    <div className={styles.container}>
      <Stack gap="sm" align="center">
        <Handshake
          className={styles.handshake}
          aria-label="Loading"
          stations={STATIONS}
          state="negotiating"
          lane={0}
          size="md"
        />
        <div role="status" aria-live="polite">
          <Text variant="caption" color="tertiary">
            Setting the table
          </Text>
        </div>
      </Stack>
    </div>
  );
}

import { useAuth } from "@mbe/auth/react";
import { Button, DepartureBoard, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoginGate.module.css";

/** Ordered domains the split-flap board cycles through — the product, in the system's mechanical voice. */
const BOARD_PHRASES = ["RESERVATIONS", "GUESTS", "FLOOR PLANS", "WAITLIST", "TIMELINE"];

/**
 * Stable accessible name for the board. Passing role="img" + aria-label through
 * to DepartureBoard's root makes the whole board one named image, so assistive
 * tech gets a single calm description instead of a live announcement every flip.
 */
const BOARD_LABEL = "Reservations, guests, floor plans, waitlist, and timeline";

/**
 * Branded sign-in gate for the unauthenticated shell. Atmosphere + grain
 * backdrop and a machined card per the rialto house style, with a split-flap
 * departure board cycling the product's domains.
 *
 * E2E contract (auth.spec.ts / auth.setup.ts): data-testid="login-prompt" on a
 * visible element, and a button whose accessible name is exactly "Sign In".
 * DepartureBoard handles prefers-reduced-motion internally (static phrase,
 * no cycling) — no extra handling needed here.
 */
export function LoginGate() {
  const { signIn } = useAuth();

  return (
    <div className={styles.gate} data-testid="login-prompt">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              Hospitality
            </Text>
            <Text variant="body" color="secondary">
              Restaurant management, simplified.
            </Text>
          </Stack>

          <DepartureBoard
            className={styles.board}
            phrases={BOARD_PHRASES}
            holdMs={2800}
            size="sm"
            role="img"
            aria-label={BOARD_LABEL}
          />

          <Button variant="primary" size="lg" onClick={() => signIn()}>
            Sign In
          </Button>

          <Text variant="caption" color="tertiary">
            Manage reservations, guests, and floor plans
          </Text>
        </Stack>
      </div>
    </div>
  );
}

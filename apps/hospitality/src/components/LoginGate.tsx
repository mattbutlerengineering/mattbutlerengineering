import { useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { Button, DepartureBoard, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoginGate.module.css";

/** Default title, matching the static default in index.html — restored on unmount so the authenticated dashboard keeps its own title. */
const DASHBOARD_TITLE = "Dashboard - Matt Butler Engineering";

/** Title for the unauthenticated landing, in the app's existing " - " convention. */
const LANDING_TITLE = "Hospitality - Matt Butler Engineering";

/** Ordered domains the split-flap board cycles through — the product, in the system's mechanical voice. */
const BOARD_PHRASES = ["RESERVATIONS", "GUESTS", "FLOOR PLANS", "WAITLIST", "TIMELINE"];

/**
 * Stable accessible name for the board. Passing role="img" + aria-label through
 * to DepartureBoard's root makes the whole board one named image, so assistive
 * tech gets a single calm description instead of a live announcement every flip.
 */
const BOARD_LABEL = "Reservations, guests, floor plans, waitlist, and timeline";

/** The two parties to the redirect leg of sign-in. */
const HANDSHAKE_STATIONS = ["Browser", "Identity"] as const;

/** Tagline shown after a sign-out round-trip lands back on this gate with no OIDC params. */
const SIGNED_OUT_TAGLINE = "You're signed out. Sign in again whenever you're ready.";

/** Default tagline shown on a first-visit (never-authenticated) sign-in. */
const DEFAULT_TAGLINE = "Restaurant management, simplified.";

/**
 * Branded sign-in gate for the unauthenticated shell. Atmosphere + grain
 * backdrop and a machined card per the rialto house style, with a split-flap
 * departure board cycling the product's domains.
 *
 * E2E contract (auth.spec.ts / auth.setup.ts): data-testid="login-prompt" on a
 * visible element, and a button whose accessible name is exactly "Sign In".
 * DepartureBoard handles prefers-reduced-motion internally (static phrase,
 * no cycling) — no extra handling needed here.
 *
 * Once `signIn()` starts the redirect (`activeNavigator === "signinRedirect"`)
 * the board gives way to a Handshake in flight and the button goes busy, so
 * the second or two before the browser leaves reads as progress, not a dead
 * click. The button's resting name stays exactly "Sign In".
 */
export interface LoginGateProps {
  /** When true, swaps in the signed-out tagline (a sign-out round-trip landed back here). */
  signedOut?: boolean;
}

export function LoginGate({ signedOut = false }: LoginGateProps = {}) {
  const { signIn, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";

  useEffect(() => {
    document.title = LANDING_TITLE;
    return () => {
      document.title = DASHBOARD_TITLE;
    };
  }, []);

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
              {signedOut ? SIGNED_OUT_TAGLINE : DEFAULT_TAGLINE}
            </Text>
          </Stack>

          {inFlight ? (
            <Handshake
              className={styles.handshake}
              aria-label="Connecting your browser to Identity"
              stations={HANDSHAKE_STATIONS}
              state="negotiating"
              size="lg"
            />
          ) : (
            <DepartureBoard
              className={styles.board}
              phrases={BOARD_PHRASES}
              holdMs={2800}
              size="sm"
              role="img"
              aria-label={BOARD_LABEL}
            />
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={() => signIn()}
            isLoading={inFlight}
            loadingText="Heading to sign-in"
          >
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

import { Link, useNavigate } from "react-router";
import { Button, Handshake, Heading, StatusLED, Text } from "@mattbutlerengineering/rialto";
import { AuthLayout } from "./AuthLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";
import styles from "./AuthLayout.module.css";

/** Stations the lapsed session's credential last traveled between. */
const HANDSHAKE_STATIONS = ["Browser", "Identity"] as const;

/**
 * Session-expired interstitial — the screen a world-class app shows when a
 * session dies mid-work. Mirrors hospitality's SessionExpiredGate: an idle
 * Handshake sits above the pulsing warning StatusLED. Demo-only, and there
 * is no in-flight state to visualise — the button navigates immediately.
 */
export function SessionExpired() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Session expired"
      footer={
        <Link to={DEMO_ROUTES.signUp} className={styles.footerLinkAccent}>
          Don&rsquo;t have an account? Sign up
        </Link>
      }
    >
      <div className={styles.instrumentSlot}>
        <Handshake
          size="md"
          stations={HANDSHAKE_STATIONS}
          lane={0}
          state="idle"
          aria-label="Session with Identity has lapsed"
        />
      </div>
      <div className={styles.lapse}>
        <StatusLED variant="warning" pulse size="lg" label="Session expired" />
        <Heading level={1} size={3}>
          Your session ended
        </Heading>
        <Text>Sign back in to pick up where you left off.</Text>
        <Button
          variant="primary"
          type="button"
          className={styles.submitButton}
          onClick={() => navigate(DEMO_ROUTES.signIn)}
        >
          Sign back in
        </Button>
      </div>
    </AuthLayout>
  );
}

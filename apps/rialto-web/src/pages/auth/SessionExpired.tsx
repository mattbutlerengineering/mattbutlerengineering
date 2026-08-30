import { Link, useNavigate } from "react-router";
import { Button, StatusLED, Text } from "@mattbutlerengineering/rialto";
import { AuthLayout } from "./AuthLayout";
import { DEMO_ROUTES } from "../../data/demo-routes";
import styles from "./AuthLayout.module.css";

/**
 * Session-expired interstitial — the screen a world-class app shows when a
 * session dies mid-work. Demo-only: the sign-in action just routes back to
 * the login demo.
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
      <div className={styles.sessionExpired}>
        <StatusLED variant="warning" pulse size="lg" label="Session expired" />
        <Text className={styles.sessionCopy}>
          Your session ended &mdash; sign back in to pick up where you left off.
        </Text>
        <Button
          variant="primary"
          type="button"
          className={styles.submitButton}
          onClick={() => navigate(DEMO_ROUTES.signIn)}
        >
          Sign in
        </Button>
      </div>
    </AuthLayout>
  );
}

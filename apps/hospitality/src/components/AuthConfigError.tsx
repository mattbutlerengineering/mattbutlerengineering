import { Stack, Text, Button } from "@mattbutlerengineering/rialto";
import styles from "../App.module.css";

/**
 * Shown when required Auth0 environment variables are missing at build time.
 * Provides a user-friendly error instead of silently failing to redirect.
 */
export function AuthConfigError({ missing }: { readonly missing: readonly string[] }) {
  return (
    <div className={styles.loginContainer}>
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">
          Configuration Error
        </Text>
        <Text variant="body" color="secondary">
          The application is missing required authentication configuration. Please contact the site
          administrator.
        </Text>
        {import.meta.env.DEV && (
          <Text variant="caption" color="secondary">
            Missing environment variables: {missing.join(", ")}
          </Text>
        )}
        <Button variant="primary" onClick={() => window.location.assign("/")}>
          Return to Home
        </Button>
      </Stack>
    </div>
  );
}

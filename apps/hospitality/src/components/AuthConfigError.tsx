import { useTranslation } from "react-i18next";
import { Stack, Text, Button } from "@mattbutlerengineering/rialto";
import styles from "../App.module.css";

/**
 * Shown when required Auth0 environment variables are missing at build time.
 * Provides a user-friendly error instead of silently failing to redirect.
 */
export function AuthConfigError({ missing }: { readonly missing: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <div className={styles.loginContainer}>
      <Stack gap="md" align="center">
        <Text as="h1" variant="display" color="primary">
          {t("auth.config.title")}
        </Text>
        <Text variant="body" color="secondary">
          {t("auth.config.body")}
        </Text>
        {import.meta.env.DEV && (
          <Text variant="caption" color="secondary">
            {t("auth.config.missing", { list: missing.join(", ") })}
          </Text>
        )}
        <Button variant="primary" onClick={() => window.location.assign("/")}>
          {t("auth.config.returnHome")}
        </Button>
      </Stack>
    </div>
  );
}

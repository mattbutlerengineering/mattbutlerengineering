import { useTranslation } from "react-i18next";
import { Button, Stack } from "@mattbutlerengineering/rialto";
import { CONTACT_MAILTO } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";
import styles from "./showcase.module.css";

/**
 * The close of the night: write to Matt, or go into the app. The sign-in
 * button is worded "Open your venue" on purpose, so the page keeps exactly one
 * button named "Sign In" (see ShowcaseHero).
 */
export function MorningScene({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return (
    <SceneShell sceneId="morning">
      <Stack direction="row" gap="md" wrap align="center">
        <a href={CONTACT_MAILTO} className={styles.primaryCtaLink}>
          {t("showcase.morning.email")}
        </a>
        <Button variant="secondary" size="lg" onClick={onSignIn}>
          {t("showcase.morning.open")}
        </Button>
      </Stack>
    </SceneShell>
  );
}

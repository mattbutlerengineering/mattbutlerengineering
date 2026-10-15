import { useTranslation } from "react-i18next";
import { Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoadingPage.module.css";

/**
 * Route-level loading state — the auth bootstrap and every lazy route's
 * Suspense fallback. A Handshake, the same hospitality instrument the rest of
 * the auth gate (LoginGate, CallbackPage, SessionExpiredGate, SignOutPage)
 * uses, so the boot sequence reads as one motif (#6334). Handshake handles
 * prefers-reduced-motion through the motion preset. The parties are the
 * browser and Hospitality.
 *
 * The polite status line is a separate sentence from the image label so a
 * screen reader hears the wait once, not twice.
 */
export function LoadingPage() {
  const { t } = useTranslation();
  const stations = [t("auth.stations.browser"), t("auth.stations.hospitality")] as const;
  return (
    <div className={styles.container}>
      <Stack gap="sm" align="center">
        <Handshake
          className={styles.handshake}
          aria-label={t("auth.loading.label")}
          stations={stations}
          state="negotiating"
          lane={0}
          size="md"
        />
        <div role="status" aria-live="polite">
          <Text variant="caption" color="tertiary">
            {t("auth.loading.status")}
          </Text>
        </div>
      </Stack>
    </div>
  );
}

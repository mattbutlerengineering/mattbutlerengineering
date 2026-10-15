import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import styles from "./OfflineBanner.module.css";

export interface OfflineBannerProps {
  /**
   * Epoch ms the currently-shown data was last confirmed synced with the
   * server — see `useReservations().lastSyncedAt`. `undefined` when no
   * successful sync has happened yet; the banner omits the timestamp
   * rather than fabricating one from the current time.
   */
  lastSyncedAt: number | undefined;
}

/**
 * Warning-styled banner shown on `TimelinePage` when reservation data is
 * offline/cached (`useReservations().isFromCache`) or the SSE connection is
 * down (`useSSEStatus().isConnected === false`) — the same visual/semantic
 * pattern as `FloorPlanCanvas`'s `.staleOverlay`, applied as a banner rather
 * than a canvas overlay. Visibility is decided by the caller (render-time
 * derivation from those two hook values), so this component only renders
 * its content — mounting it *is* "visible".
 */
export function OfflineBanner({ lastSyncedAt }: OfflineBannerProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  return (
    <div className={styles.offlineBanner} role="status" data-testid="offline-banner">
      <Text variant="label" className={styles.pulseDot} />
      <Text className={styles.label}>
        {lastSyncedAt !== undefined
          ? t("offlineBanner.cachedWithTime", {
              time: fmt.formatInstant(lastSyncedAt, { hour: "numeric", minute: "2-digit" }),
            })
          : t("offlineBanner.cached")}
      </Text>
    </div>
  );
}

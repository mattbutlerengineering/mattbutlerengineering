import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import type { GuestSignalBadge } from "./guest-signal-badge.js";
import styles from "./GuestSignalBadgeChip.module.css";

export interface GuestSignalBadgeChipProps {
  badge: GuestSignalBadge;
  className?: string;
  /** Computed placement only (e.g. a block's left edge); colour and type live in the module. */
  style?: CSSProperties;
}

/** The sentence a screen reader gets for a badge: how late, the ETA, and whether it has passed. */
export function useGuestSignalBadgeLabel(badge: GuestSignalBadge): string {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const time = fmt.formatTime(badge.eta);
  return t(badge.held ? "onMyWayBadge.aria" : "onMyWayBadge.ariaPast", {
    minutes: badge.minutes,
    time,
  });
}

/**
 * Amber "+15 · ETA 7:45" chip for a party that said it is running late. A polite status region
 * named with the full sentence, so a badge that appears on a live screen is announced.
 */
export function GuestSignalBadgeChip({ badge, className, style }: GuestSignalBadgeChipProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const label = useGuestSignalBadgeLabel(badge);
  return (
    <span
      role="status"
      aria-label={label}
      data-testid="guest-signal-badge"
      style={style}
      data-held={badge.held}
      className={[styles.chip, badge.held ? "" : styles.chipPast, className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {t("onMyWayBadge.text", { minutes: badge.minutes, time: fmt.formatTime(badge.eta) })}
    </span>
  );
}

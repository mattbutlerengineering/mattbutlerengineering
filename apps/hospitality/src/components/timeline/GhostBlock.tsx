import { useTranslation } from "react-i18next";
import styles from "./GhostBlock.module.css";

export interface GhostBlockProps {
  /** The party the suggested move is for. */
  party: string;
  style: { left: number; width: number };
}

/**
 * Where Autopilot suggests a party could go. It must never read as a booking: dashed outline,
 * no fill, a "Suggested" label with a spark, no pointer events, not focusable, and hidden from
 * assistive tech. The Autopilot panel is the accessible source for the same moves.
 */
export function GhostBlock({ party, style }: GhostBlockProps) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.ghost}
      style={{ left: style.left, width: style.width }}
      aria-hidden="true"
      data-testid="autopilot-ghost"
    >
      <svg className={styles.spark} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path
          d="M8 1l1.8 4.7L14.5 7.5l-4.7 1.8L8 14l-1.8-4.7L1.5 7.5l4.7-1.8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.label}>{t("timeline.autopilot.ghostLabel", { party })}</span>
    </div>
  );
}

import { useId, useRef } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Heading, IconButton, Text } from "@mattbutlerengineering/rialto";
import { useFocusTrap, useReturnFocus } from "@mattbutlerengineering/rialto/hooks";
import type { RehearsalMetrics } from "./rehearsal-state";
import type { RehearsalNavProfile } from "./rehearsal-route";
import styles from "./CurtainCall.module.css";

export interface CurtainCallProps {
  profile: RehearsalNavProfile;
  metrics: RehearsalMetrics;
  tableName: (tableId: string) => string;
  /** A minute from venue midnight as the venue's wall-clock time. */
  formatMinute: (minute: number) => string;
  locale: string;
  onRunAgain: () => void;
  onTryOther: (profile: RehearsalNavProfile) => void;
  onLeave: () => void;
  /** Closing returns to the paused workspace; it is not "leave" and is never triggered by Escape. */
  onClose: () => void;
}

const MINUTES_PER_HOUR = 60;

function formatDuration(t: TFunction, totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return t("rehearsal.curtain.durationMinutes", { minutes });
  if (minutes === 0) return t("rehearsal.curtain.durationHours", { hours });
  return t("rehearsal.curtain.durationHoursMinutes", { hours, minutes });
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M1 1l12 12M13 1L1 13" />
    </svg>
  );
}

/**
 * The night's verdict (ux.md Screen 4): a labelled, focus-trapped modal that focuses its heading.
 * Escape is deliberately not handled, so focus is never lost; Leave and Close are the exits.
 */
export function CurtainCall({
  profile,
  metrics,
  tableName,
  formatMinute,
  locale,
  onRunAgain,
  onTryOther,
  onLeave,
  onClose,
}: CurtainCallProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusTrap(panelRef, true, { initialFocus: headingRef });
  useReturnFocus(true);

  const other: RehearsalNavProfile = profile === "friday" ? "weeknight" : "friday";
  const neverSat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    metrics.tablesNeverSat.map(tableName)
  );

  const rows =
    metrics.coversServed === 0 ? null : (
      <dl className={styles.metrics}>
        <Row label={t("rehearsal.curtain.covers")} value={String(metrics.coversServed)} />
        {/* The simulator departs every seated party by close, so a served night has turn and peak data. */}
        {metrics.avgTurnMinutes !== null && (
          <Row
            label={t("rehearsal.curtain.avgTurn")}
            value={formatDuration(t, metrics.avgTurnMinutes)}
          />
        )}
        {metrics.peakHour !== null && (
          <Row
            label={t("rehearsal.curtain.peak")}
            value={t("rehearsal.curtain.peakRange", {
              from: formatMinute(metrics.peakHour * MINUTES_PER_HOUR),
              to: formatMinute((metrics.peakHour + 1) * MINUTES_PER_HOUR),
            })}
          />
        )}
        <Row
          label={t("rehearsal.curtain.neverSat")}
          value={metrics.tablesNeverSat.length === 0 ? t("rehearsal.curtain.allSat") : neverSat}
        />
        <Row
          label={t("rehearsal.curtain.longestWait")}
          value={
            metrics.longestWalkInWaitMinutes === null
              ? t("rehearsal.curtain.nobodyWaited")
              : formatDuration(t, metrics.longestWalkInWaitMinutes)
          }
        />
      </dl>
    );

  return (
    <div className={styles.backdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
      >
        <IconButton
          className={styles.close}
          icon={<CloseIcon />}
          aria-label={t("rehearsal.curtain.close")}
          onClick={onClose}
        />
        <Heading
          level={2}
          size={5}
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className={styles.title}
        >
          {profile === "friday"
            ? t("rehearsal.curtain.titleFriday")
            : t("rehearsal.curtain.titleWeeknight")}
        </Heading>
        {rows ?? (
          <Text as="p" className={styles.disclaimer}>
            {t("rehearsal.curtain.noCovers")}{" "}
            <Link to="/floor-plans">{t("rehearsal.notEnough.floorPlans")}</Link>
          </Text>
        )}
        <Text as="p" className={styles.disclaimer}>
          {t("rehearsal.curtain.disclaimer")}
        </Text>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onRunAgain}>
            {t("rehearsal.curtain.again")}
          </Button>
          <Button variant="secondary" onClick={() => onTryOther(other)}>
            {other === "weeknight"
              ? t("rehearsal.curtain.tryWeeknight")
              : t("rehearsal.curtain.tryFriday")}
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            {t("rehearsal.banner.leave")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
    </div>
  );
}

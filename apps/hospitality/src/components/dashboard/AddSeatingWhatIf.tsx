import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Select, Text } from "@mattbutlerengineering/rialto";
import {
  busiestTurnedAwaySlot,
  estimateAddedSeating,
  type CandidateSeating,
  type LostDemand,
} from "@mbe/types";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import styles from "./AddSeatingWhatIf.module.css";

interface AddSeatingWhatIfProps {
  /** The venue's turned-away counts; the control needs timed demand to preview against. */
  readonly demand: LostDemand | null | undefined;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const STEP_MINUTES = 30;
const TIMES = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, i) => i * STEP_MINUTES);

/** 2026-11-01 is a Sunday, so weekday N (0 = Sunday) is the (1 + N)th of that week. */
const weekdayName = (locale: string, weekday: number): string =>
  formatCalendarDate(`2026-11-0${weekday + 1}`, { weekday: "long" }, locale);

const clock = (locale: string, minute: number): string =>
  formatLocalTime(
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    locale
  );

/** "Add a seating at…": what a seating at a day and time would have caught, as an estimate. */
export function AddSeatingWhatIf({ demand }: AddSeatingWhatIfProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const busiest = useMemo(() => (demand ? busiestTurnedAwaySlot(demand) : null), [demand]);
  const [picked, setPicked] = useState<CandidateSeating | null>(null);

  if (!demand || !busiest) return null;

  const seating = picked ?? busiest;
  const estimate = estimateAddedSeating(demand, seating);

  return (
    <Card title={t("home.whatIf.title")}>
      <div className={styles.controls}>
        <Select
          aria-label={t("home.whatIf.day")}
          value={String(seating.weekday)}
          options={WEEKDAYS.map((d) => ({ value: String(d), label: weekdayName(locale, d) }))}
          onChange={(v) => setPicked({ ...seating, weekday: Number(v) })}
        />
        <Select
          aria-label={t("home.whatIf.time")}
          value={String(Math.floor(seating.minute / STEP_MINUTES) * STEP_MINUTES)}
          options={TIMES.map((m) => ({ value: String(m), label: clock(locale, m) }))}
          onChange={(v) => setPicked({ ...seating, minute: Number(v) })}
        />
      </div>
      <Text variant="body" role="status">
        {estimate.searches === 0
          ? t("home.whatIf.none")
          : t("home.whatIf.estimate", {
              count: estimate.searches,
              perNight: estimate.perNight,
            })}
      </Text>
      <Text className={styles.note} color="secondary">
        {t("home.whatIf.note")}
      </Text>
    </Card>
  );
}

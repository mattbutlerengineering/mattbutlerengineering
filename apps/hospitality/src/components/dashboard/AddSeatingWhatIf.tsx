import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, Select, Skeleton, Text } from "@mattbutlerengineering/rialto";
import {
  busiestTurnedAwaySlot,
  type CandidateSeating,
  type LostDemand,
  type LostDemandWhatIf,
} from "@mbe/types";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useLostDemandWhatIf } from "../../hooks/useLostDemandWhatIf.js";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner";
import styles from "./AddSeatingWhatIf.module.css";

interface AddSeatingWhatIfProps {
  readonly venueId: string | null;
  /** The venue's turned-away counts; the control needs timed demand to pick a starting slot. */
  readonly demand: LostDemand | null | undefined;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const STEP_MINUTES = 30;
const TIMES = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, i) => i * STEP_MINUTES);

const hhmm = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** 2026-11-01 is a Sunday, so weekday N (0 = Sunday) is the (1 + N)th of that week. */
const weekdayName = (locale: string, weekday: number): string =>
  formatCalendarDate(`2026-11-0${weekday + 1}`, { weekday: "long" }, locale);

const clock = (locale: string, minute: number): string => formatLocalTime(hhmm(minute), locale);

interface ResultProps {
  readonly result: LostDemandWhatIf;
  readonly locale: string;
  readonly t: TFunction;
}

/** One plain sentence per outcome; only an estimate carries a number. */
function Result({ result, locale, t }: ResultProps) {
  const shared = {
    weekday: weekdayName(locale, result.weekday),
    time: clock(locale, result.minute),
  };
  if (result.outcome === "closed") return <Text>{t("home.whatIf.closed", shared)}</Text>;
  if (result.outcome === "already_offered") {
    return <Text>{t("home.whatIf.alreadyOffered", shared)}</Text>;
  }
  if (result.outcome === "blocked") return <Text>{t("home.whatIf.blocked", shared)}</Text>;
  return (
    <>
      <Text variant="body">
        {result.searches === 0
          ? t("home.whatIf.none", shared)
          : t("home.whatIf.estimate", {
              ...shared,
              count: result.searches,
              perNight: result.perNight,
            })}
      </Text>
      {result.anyTimeSearches > 0 && (
        <Text className={styles.note} color="secondary">
          {t("home.whatIf.anyTime", { ...shared, count: result.anyTimeSearches })}
        </Text>
      )}
    </>
  );
}

/** "Add a seating at…": the server previews the seating and says what it would have caught. */
export function AddSeatingWhatIf({ venueId, demand }: AddSeatingWhatIfProps) {
  const busiest = useMemo(() => (demand ? busiestTurnedAwaySlot(demand) : null), [demand]);
  // No timed demand, nothing to start from, and no request is made.
  if (!venueId || !busiest) return null;
  return <AddSeatingCard venueId={venueId} busiest={busiest} />;
}

function AddSeatingCard({
  venueId,
  busiest,
}: {
  readonly venueId: string;
  readonly busiest: CandidateSeating;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [picked, setPicked] = useState<CandidateSeating | null>(null);
  const seating = picked ?? busiest;
  const slot = Math.floor(seating.minute / STEP_MINUTES) * STEP_MINUTES;

  const { data, isLoading, error, refetch } = useLostDemandWhatIf({
    venueId,
    weekday: seating.weekday,
    time: hhmm(slot),
  });
  const failure = error ? describeApiError(error) : null;

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
          value={String(slot)}
          options={TIMES.map((m) => ({ value: String(m), label: clock(locale, m) }))}
          onChange={(v) => setPicked({ ...seating, minute: Number(v) })}
        />
      </div>
      <div role="status" aria-live="polite">
        {failure ? (
          <ErrorRetryBanner
            title={t("home.whatIf.loadFailed")}
            error={failure.detail}
            details={failure.raw}
            onRetry={refetch}
          />
        ) : isLoading || !data ? (
          <Skeleton variant="rect" height={48} width="100%" />
        ) : (
          <Result result={data} locale={locale} t={t} />
        )}
      </div>
      <Text className={styles.note} color="secondary">
        {t("home.whatIf.note")}
      </Text>
    </Card>
  );
}

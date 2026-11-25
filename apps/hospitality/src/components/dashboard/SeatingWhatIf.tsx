import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, Select, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { LostDemand, LostDemandWhatIf } from "@mbe/types";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useLostDemandWhatIf } from "../../hooks/useLostDemandWhatIf.js";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import { ErrorRetryBanner } from "../ErrorRetryBanner";
import styles from "./SeatingWhatIf.module.css";

interface SeatingWhatIfProps {
  readonly venueId: string;
  /** The turned-away read the heatmap shows; picks the starting weekday and hour. */
  readonly demand: LostDemand | null | undefined;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const ANY_PARTY = "all";
const PARTY_RANGES = {
  "1-2": { min: 1, max: 2, key: "party1to2" },
  "3-4": { min: 3, max: 4, key: "party3to4" },
  "5-8": { min: 5, max: 8, key: "party5to8" },
  "9-20": { min: 9, max: 20, key: "party9plus" },
} as const;
type PartyChoice = typeof ANY_PARTY | keyof typeof PARTY_RANGES;

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, "0");
  return `${hh}:${i % 2 === 0 ? "00" : "30"}`;
});

const toHhmm = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The busiest weekday and half past its busiest hour, so the first estimate is the one that matters. */
function startingPick(demand: LostDemand): { weekday: number; time: string } {
  const busiest = <T extends { searches: number }>(rows: readonly T[] | undefined): T | undefined =>
    rows?.reduce<T | undefined>(
      (best, r) => (!best || r.searches > best.searches ? r : best),
      undefined
    );
  const top = busiest(demand?.cells);
  if (top) return { weekday: top.weekday, time: `${String(top.hour).padStart(2, "0")}:30` };
  return { weekday: busiest(demand?.anyTime)?.weekday ?? 5, time: "19:30" };
}

interface ResultProps {
  readonly result: LostDemandWhatIf;
  readonly locale: string;
  readonly t: TFunction;
}

function Result({ result, locale, t }: ResultProps) {
  const weekday = formatCalendarDate(`2026-11-0${result.weekday + 1}`, { weekday: "long" }, locale);
  const time = formatLocalTime(toHhmm(result.minute), locale);
  const shared = { weekday, time };

  if (result.outcome === "closed") return <Text>{t("home.turnedAway.whatIf.closed", shared)}</Text>;
  if (result.outcome === "blocked")
    return <Text>{t("home.turnedAway.whatIf.blocked", shared)}</Text>;
  if (result.outcome === "already_offered") {
    return <Text>{t("home.turnedAway.whatIf.alreadyOffered", shared)}</Text>;
  }
  return (
    <>
      <Text variant="body">
        {result.searches > 0
          ? t("home.turnedAway.whatIf.result", { ...shared, count: result.searches })
          : t("home.turnedAway.whatIf.none", shared)}
      </Text>
      <Text className={styles.method} color="secondary">
        {t("home.turnedAway.whatIf.method", {
          ...shared,
          count: result.searches,
          from: formatLocalTime(toHhmm(result.windowStart), locale),
          to: formatLocalTime(toHhmm(result.windowEnd), locale),
        })}
      </Text>
      {result.minParty !== null && result.maxParty !== null && (
        <Text className={styles.method} color="secondary">
          {t("home.turnedAway.whatIf.partyNote", { min: result.minParty, max: result.maxParty })}
        </Text>
      )}
      {result.anyTimeSearches > 0 && (
        <Text className={styles.method} color="secondary">
          {t("home.turnedAway.whatIf.anyTimeNote", { count: result.anyTimeSearches })}
        </Text>
      )}
    </>
  );
}

export function SeatingWhatIf({ venueId, demand }: SeatingWhatIfProps) {
  // Nothing was turned away: there is nothing to estimate against (the heatmap says so), and
  // no request is made.
  if (!demand || demand.total === 0) return null;
  return <SeatingWhatIfCard venueId={venueId} demand={demand} />;
}

function SeatingWhatIfCard({
  venueId,
  demand,
}: {
  readonly venueId: string;
  readonly demand: LostDemand;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const start = useMemo(() => startingPick(demand), [demand]);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [party, setParty] = useState<PartyChoice>(ANY_PARTY);
  const pick = { weekday: weekday ?? start.weekday, time: time ?? start.time };
  const range = party === ANY_PARTY ? null : PARTY_RANGES[party];

  const { data, isLoading, error, refetch } = useLostDemandWhatIf({
    venueId,
    ...pick,
    ...(range ? { minParty: range.min, maxParty: range.max } : {}),
  });

  const failure = error ? describeApiError(error) : null;
  return (
    <Card title={t("home.turnedAway.whatIf.title")}>
      <Text variant="body" color="secondary">
        {t("home.turnedAway.whatIf.intro")}
      </Text>
      <div className={styles.controls}>
        <Select
          label={t("home.turnedAway.whatIf.weekday")}
          value={String(pick.weekday)}
          options={WEEKDAYS.map((d) => ({
            value: String(d),
            label: formatCalendarDate(`2026-11-0${d + 1}`, { weekday: "long" }, locale),
          }))}
          onChange={(v) => setWeekday(Number(v))}
        />
        <Select
          label={t("home.turnedAway.whatIf.time")}
          value={pick.time}
          options={HALF_HOURS.map((hhmm) => ({
            value: hhmm,
            label: formatLocalTime(hhmm, locale),
          }))}
          onChange={setTime}
        />
        <Select
          label={t("home.turnedAway.whatIf.party")}
          value={party}
          options={[
            { value: ANY_PARTY, label: t("home.turnedAway.whatIf.partyAll") },
            ...(Object.keys(PARTY_RANGES) as (keyof typeof PARTY_RANGES)[]).map((k) => ({
              value: k,
              label: t(`home.turnedAway.whatIf.${PARTY_RANGES[k].key}`),
            })),
          ]}
          onChange={(v) => setParty(v as PartyChoice)}
        />
      </div>
      <div className={styles.result} role="status" aria-live="polite">
        {failure ? (
          <ErrorRetryBanner
            title={t("home.turnedAway.whatIf.loadFailed")}
            error={failure.detail}
            details={failure.raw}
            onRetry={refetch}
          />
        ) : isLoading || !data ? (
          <Skeleton variant="rect" height={64} width="100%" />
        ) : (
          <Result result={data} locale={locale} t={t} />
        )}
      </div>
    </Card>
  );
}

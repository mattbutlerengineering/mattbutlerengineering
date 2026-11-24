import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { LostDemand } from "@mbe/types";
import { formatCalendarDate, formatWallHour } from "../../utils/format.js";
import styles from "./TurnedAwayHeatmap.module.css";

interface TurnedAwayHeatmapProps {
  /** The venue's turned-away counts; null/undefined until there is a read. */
  readonly demand: LostDemand | null | undefined;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** 2026-11-01 is a Sunday, so weekday N (0 = Sunday) is the (1 + N)th of that week. */
function weekdayName(locale: string, weekday: number, style: "short" | "long"): string {
  return formatCalendarDate(`2026-11-0${weekday + 1}`, { weekday: style }, locale);
}

/** A venue-local hour on the dashboard locale's clock ("7 PM", "19 h"). */
const hourLabel = (locale: string, hour: number): string => formatWallHour(hour, locale);

interface HeatRows {
  readonly hours: readonly number[];
  readonly byCell: ReadonlyMap<string, number>;
  readonly anyTime: ReadonlyMap<number, number>;
  readonly max: number;
}

/** Every hour from the first to the last with a count, quiet ones between included. */
function toRows(demand: LostDemand): HeatRows {
  const byCell = new Map(demand.cells.map((c) => [`${c.weekday}:${c.hour}`, c.searches]));
  const anyTime = new Map(demand.anyTime.map((a) => [a.weekday, a.searches]));
  const hoursWithCounts = demand.cells.map((c) => c.hour);
  const first = Math.min(...hoursWithCounts);
  const last = Math.max(...hoursWithCounts);
  const hours =
    hoursWithCounts.length === 0
      ? []
      : Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(1, ...demand.cells.map((c) => c.searches), ...anyTime.values());
  return { hours, byCell, anyTime, max };
}

function Cell({ count, max }: { readonly count: number; readonly max: number }) {
  // Shade is a second cue only: the count is always the visible text.
  const style = count > 0 ? ({ "--heat": count / max } as CSSProperties) : undefined;
  return (
    <td className={count > 0 ? styles.hot : styles.cold} style={style}>
      {count}
    </td>
  );
}

export function TurnedAwayHeatmap({ demand }: TurnedAwayHeatmapProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rows = useMemo(() => (demand && demand.total > 0 ? toRows(demand) : null), [demand]);

  // undefined = the read hasn't resolved; claiming "nobody was turned away" now would be false.
  if (demand === undefined) {
    return (
      <Card title={t("home.turnedAway.title")}>
        <Skeleton variant="rect" height={120} width="100%" />
      </Card>
    );
  }

  if (!demand || !rows) {
    return (
      <Card title={t("home.turnedAway.title")}>
        <Text variant="body" color="secondary">
          {t("home.turnedAway.empty")}
        </Text>
      </Card>
    );
  }

  return (
    <Card title={t("home.turnedAway.title")}>
      <Text variant="body" color="secondary">
        {t("home.turnedAway.summary", { count: demand.total })}
      </Text>
      <div className={styles.scroll}>
        {/* eslint-disable mbe-local/prefer-rialto-components -- a weekday x hour matrix needs per-cell heat and two header axes; Rialto Table is a column list */}
        <table className={styles.table}>
          <caption className={styles.caption}>{t("home.turnedAway.tableLabel")}</caption>
          <thead>
            <tr>
              <td className={styles.corner} />
              {WEEKDAYS.map((weekday) => (
                <th
                  key={weekday}
                  scope="col"
                  abbr={weekdayName(locale, weekday, "long")}
                  className={styles.colHead}
                >
                  {weekdayName(locale, weekday, "short")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.hours.map((hour) => (
              <tr key={hour}>
                <th scope="row" className={styles.rowHead}>
                  {hourLabel(locale, hour)}
                </th>
                {WEEKDAYS.map((weekday) => (
                  <Cell
                    key={weekday}
                    count={rows.byCell.get(`${weekday}:${hour}`) ?? 0}
                    max={rows.max}
                  />
                ))}
              </tr>
            ))}
            <tr className={styles.anyTimeRow}>
              <th scope="row" className={styles.rowHead}>
                {t("home.turnedAway.anyTime")}
              </th>
              {WEEKDAYS.map((weekday) => (
                <Cell key={weekday} count={rows.anyTime.get(weekday) ?? 0} max={rows.max} />
              ))}
            </tr>
          </tbody>
        </table>
        {/* eslint-enable mbe-local/prefer-rialto-components */}
      </div>
      <Text className={styles.note} color="secondary">
        {t("home.turnedAway.anyTimeNote")}
      </Text>
    </Card>
  );
}

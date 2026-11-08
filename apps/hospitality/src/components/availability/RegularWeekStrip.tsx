import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Heading, Select, Skeleton, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import {
  addDays,
  applyChanges,
  localDateTimeOf,
  regularWeekView,
  weekdayIndexOf,
  weekSpans,
  type DaySpans,
} from "@mbe/availability";
import {
  PREVIEW_PARTY_DEFAULT,
  PREVIEW_PARTY_MAX,
  type AvailabilityConfig,
  type Table,
} from "@mbe/types";
import { useTables } from "../../hooks/useTables.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import {
  WEEK_DISPLAY_ORDER,
  draftToChanges,
  effectiveDays,
  type QuickSetupDraft,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import styles from "./RegularWeekStrip.module.css";

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

/** Only the minutes of a service day matter to the strip; the zone decides daylight-saving gaps alone. */
const FALLBACK_TIME_ZONE = "UTC";

const PARTY_OPTIONS = Array.from({ length: PREVIEW_PARTY_MAX }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

export interface RegularWeekStripProps {
  readonly draft: QuickSetupDraft;
  /** No venue yet (the onboarding wizard): the typed hours only, with no tables and no party. */
  readonly local?: boolean;

  /**
   * The id of the row that already titles this strip and says its hint (the phone's disclosure):
   * the strip drops its own heading and hint and takes its name from that row.
   */
  readonly labelledBy?: string;
}

const NO_TABLES: readonly Table[] = [];

const hasName = (s: ServiceDraft) => s.name.trim() !== "";
const isComplete = (s: ServiceDraft) =>
  hasName(s) && s.opens !== null && s.lastSeating !== null && s.closes !== null;

/** The services the strip can draw: a name, three times and at least one day. */
const placedServices = (draft: QuickSetupDraft) =>
  draft.services.filter((s) => isComplete(s) && effectiveDays(draft, s).length > 0);

interface Row {
  readonly weekday: number;
  readonly lines: readonly {
    readonly name: string;
    readonly first: string;
    readonly last: string;
    readonly noTableFits: boolean;
  }[];
  readonly notOffered: readonly string[];
}

/** The seven weekdays of `weekSpans`, Monday first, each with the services that run and those that do not. */
function rowsOf(
  days: readonly DaySpans[],
  names: ReadonlyMap<string, string>,
  order: readonly string[],
  time: (minute: number) => string
): Row[] {
  const byWeekday = new Map(days.map((d) => [weekdayIndexOf(d.serviceDate), d]));
  return WEEK_DISPLAY_ORDER.map((weekday) => {
    const services = byWeekday.get(weekday)?.services ?? [];
    const running = new Set(services.map((s) => s.venueServiceId));
    return {
      weekday,
      lines: services.map((s) => ({
        name: names.get(s.venueServiceId) ?? "",
        first: time(s.firstAt),
        last: time(s.lastAt),
        noTableFits: s.noTableFits,
      })),
      notOffered: order.filter((id) => !running.has(id)).map((id) => names.get(id) ?? ""),
    };
  });
}

/**
 * S12: the regular week as a guest would book it, computed in the browser by the same engine the
 * venue runs (`weekSpans` over the draft), so it moves with every keystroke and asks the server
 * for nothing. Only the venue's tables are read, for the party check; while they load or if the
 * read fails the spans show without it, and Save is never blocked.
 */
export function RegularWeekStrip({ draft, local = false, labelledBy }: RegularWeekStripProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const [partySize, setPartySize] = useState(PREVIEW_PARTY_DEFAULT);
  const tablesRead = useTables({ activeOnly: true, enabled: !local });
  const [now] = useState(() => new Date());
  const timeZone = format.timeZone || FALLBACK_TIME_ZONE;

  const tablesPending = !local && tablesRead.isLoading;
  const tablesFailed = !local && tablesRead.data === undefined && tablesRead.error !== null;
  const tables =
    !local && !tablesPending && !tablesFailed ? (tablesRead.data ?? NO_TABLES) : NO_TABLES;

  const shown = placedServices(draft);
  const left = draft.services.flatMap((service) => {
    if (!hasName(service) || shown.includes(service)) return [];
    return [{ name: service.name.trim(), reason: isComplete(service) ? "days" : "time" } as const];
  });
  const anyComplete = draft.services.some(isComplete);

  const week = useMemo(() => {
    const placed = placedServices(draft);
    if (placed.length === 0) return null;
    let n = 0;
    const config = applyChanges(
      EMPTY_CONFIG,
      draftToChanges({ ...draft, services: placed }, EMPTY_CONFIG, () => `strip-${++n}`),
      now.toISOString()
    );
    const today = localDateTimeOf(now, timeZone).date;
    // Any Monday would do: the regular week has no dates. This week's keeps daylight-saving honest.
    const from = addDays(today, -((weekdayIndexOf(today) + 6) % 7));
    const days = weekSpans(regularWeekView(config), {
      timezone: timeZone,
      from,
      partySize,
      tables,
      now,
    });
    const ids = config.venueServices.map((vs) => vs.id);
    const names = new Map(config.venueServices.map((vs) => [vs.id, vs.name]));
    return { days, ids, names };
  }, [draft, partySize, tables, timeZone, now]);

  const rows = useMemo(
    () =>
      week
        ? rowsOf(week.days, week.names, week.ids, (minute) => minuteText(minute, t, format))
        : null,
    [week, t, format]
  );

  // "Updated": the weekdays whose lines moved in the last change. Held until the next one.
  const signatures = rows?.map((row) => JSON.stringify(row)) ?? [];
  const [seen, setSeen] = useState<{ signatures: readonly string[]; updated: readonly number[] }>({
    signatures,
    updated: [],
  });
  if (seen.signatures.join("\n") !== signatures.join("\n")) {
    const updated =
      seen.signatures.length === 0 || signatures.length === 0
        ? []
        : (rows ?? []).flatMap((row, i) =>
            signatures[i] !== seen.signatures[i] ? [row.weekday] : []
          );
    setSeen({ signatures, updated });
  }

  return (
    <aside
      className={styles.strip}
      aria-label={labelledBy === undefined ? t("availability.quickSetup.previewTitle") : undefined}
      aria-labelledby={labelledBy}
    >
      <Stack gap="sm">
        {labelledBy === undefined && (
          <>
            {/* Size 5: a side panel's title, not louder than the card it sits in. */}
            <Heading level={3} size={5}>
              {t("availability.quickSetup.previewTitle")}
            </Heading>
            <Text variant="caption" color="secondary">
              {t(
                local
                  ? "availability.quickSetup.strip.local"
                  : "availability.quickSetup.strip.about"
              )}
            </Text>
          </>
        )}
        {!local && (
          <div className={styles.party}>
            <Select
              label={t("availability.preview.party")}
              options={PARTY_OPTIONS}
              value={String(partySize)}
              onChange={(value) => setPartySize(Number(value))}
            />
          </div>
        )}
        {tablesPending && (
          <>
            <Text variant="caption" color="secondary">
              {t("availability.quickSetup.strip.checking")}
            </Text>
            <Skeleton variant="text" lines={1} />
          </>
        )}
        {tablesFailed && (
          <Stack gap="xs">
            <Text variant="caption" color="warning">
              {t("availability.quickSetup.strip.tablesFailed")}
            </Text>
            <div>
              {/* Not `disabled`: a disabled button drops the focus the click gave it. */}
              <Button variant="secondary" size="sm" onClick={() => void tablesRead.refetch()}>
                {t("availability.quickSetup.strip.checkAgain")}
              </Button>
            </div>
          </Stack>
        )}
        {rows === null ? (
          <Text variant="body" color="secondary">
            {t(
              anyComplete
                ? "availability.quickSetup.strip.chooseDays"
                : "availability.quickSetup.strip.empty"
            )}
          </Text>
        ) : (
          <ul className={styles.list} aria-busy={tablesPending}>
            {rows.map((row) => {
              const updated = seen.updated.includes(row.weekday);
              const lines = row.lines.map((line) =>
                line.noTableFits
                  ? t("availability.quickSetup.strip.noTableFits", {
                      name: line.name,
                      size: partySize,
                    })
                  : t("availability.quickSetup.strip.span", line)
              );
              const spoken =
                row.lines.length === 0
                  ? t("availability.quickSetup.strip.closed")
                  : row.lines
                      .map((line) =>
                        line.noTableFits
                          ? t("availability.quickSetup.strip.noTableFits", {
                              name: line.name,
                              size: partySize,
                            })
                          : t("availability.quickSetup.strip.spanSpoken", line)
                      )
                      .join(", ");
              return (
                <li
                  key={row.weekday}
                  className={styles.row}
                  aria-label={t(
                    updated
                      ? "availability.quickSetup.strip.rowUpdated"
                      : "availability.quickSetup.strip.row",
                    { day: dayName(row.weekday), lines: spoken }
                  )}
                >
                  <div className={styles.rowHead}>
                    <Text variant="label">{dayName(row.weekday)}</Text>
                    {updated && <Tag>{t("availability.quickSetup.strip.updated")}</Tag>}
                  </div>
                  {lines.length === 0 ? (
                    <Text variant="body" color="secondary">
                      {t("availability.quickSetup.strip.closed")}
                    </Text>
                  ) : (
                    lines.map((line) => (
                      <Text key={line} variant="body">
                        {line}
                      </Text>
                    ))
                  )}
                  {row.notOffered.length > 0 && lines.length > 0 && (
                    <Text variant="caption" color="secondary">
                      {t("availability.quickSetup.strip.notOffered", {
                        services: row.notOffered.join(", "),
                      })}
                    </Text>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {rows !== null &&
          left.map((service) => (
            <Text key={service.name} variant="caption" color="secondary">
              {t(
                service.reason === "days"
                  ? "availability.quickSetup.strip.notShownDays"
                  : "availability.quickSetup.strip.notShownTime",
                { name: service.name }
              )}
            </Text>
          ))}
        {!local && (
          <Text className={styles.visuallyHidden} role="status">
            {seen.updated.length > 0
              ? t("availability.quickSetup.strip.updatedDays", {
                  days: seen.updated.map((day) => dayName(day)).join(", "),
                })
              : ""}
          </Text>
        )}
      </Stack>
    </aside>
  );
}

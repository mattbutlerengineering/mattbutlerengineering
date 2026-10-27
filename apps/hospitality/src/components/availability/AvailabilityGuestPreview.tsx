import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  SegmentedControl,
  Skeleton,
  Stack,
  Tag,
  Text,
} from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfigChanges,
  PreviewAvailabilityBody,
  PreviewResult,
  ScopeConflictMode,
  StrandedReservation,
} from "@mbe/types";
import { useAvailabilityPreview } from "../../hooks/useAvailabilityPreview.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import styles from "./AvailabilityGuestPreview.module.css";

/** How long the draft must sit still before it is previewed. */
export const PREVIEW_DEBOUNCE_MS = 400;

/** Most dates the date strip shows at once. */
const STRIP_SIZE = 5;

export interface AvailabilityGuestPreviewProps {
  readonly venueId: string;
  /** The row operations a save of the draft would send. */
  readonly changes: AvailabilityConfigChanges;
  readonly scopeConflicts: ScopeConflictMode;
  /** Every service date the edit reaches; the stranded check covers all of them. */
  readonly dates: readonly string[];
  /** The date shown in full. */
  readonly focusDate: string;
}

interface Settled {
  readonly key: string;
  readonly body: PreviewAvailabilityBody;
}

/** The draft once it has stopped changing for `PREVIEW_DEBOUNCE_MS`; `pending` while it has not. */
function useSettledBody(body: PreviewAvailabilityBody) {
  const key = JSON.stringify(body);
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setSettled({ key, body: JSON.parse(key) as PreviewAvailabilityBody }),
      PREVIEW_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [key]);
  return { body: settled?.body ?? null, pending: settled?.key !== key };
}

const isSlow = (error: Error): boolean =>
  (error as { problemDetails?: { status?: number } }).problemDetails?.status === 503;

function StrandedList(props: { readonly stranded: PreviewResult["stranded"] }) {
  const { stranded } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  if (stranded.total === 0) return null;
  const line = (r: StrandedReservation) =>
    t("availability.preview.strandedItem", {
      date: format.formatInstant(r.startTime, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      time: format.formatTime(r.startTime),
      size: r.partySize,
      reason: t(`availability.preview.reason.${r.reason}`),
    });
  const more = stranded.total - stranded.offset - stranded.items.length;
  return (
    <Stack gap="xs">
      <Text variant="label" color="warning">
        {t("availability.preview.stranded", { count: stranded.total })}
      </Text>
      <ul className={styles.list}>
        {stranded.items.map((r) => (
          <li key={r.id}>
            <Text as="span" variant="body" color="primary">
              {line(r)}
            </Text>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Text variant="caption" color="secondary">
          {t("availability.preview.strandedMore", { count: more })}
        </Text>
      )}
    </Stack>
  );
}

const dayOf = (result: PreviewResult, date: string) =>
  result.days.find((d) => d.serviceDate === date);

/** "3 times added · 2 removed", plus the bookings the draft would strand. */
function Summary(props: { readonly result: PreviewResult; readonly date: string }) {
  const { result, date } = props;
  const { t } = useTranslation();
  const day = dayOf(result, date);
  const summary = t("availability.preview.summary", {
    added: t("availability.preview.addedCount", { count: day?.added.length ?? 0 }),
    removed: t("availability.preview.removedCount", { count: day?.removed.length ?? 0 }),
  });
  const affected = result.stranded.total;
  return (
    <Text variant="body" color="primary">
      {affected > 0
        ? t("availability.preview.summaryAffected", {
            summary,
            affected: t("availability.preview.affectedCount", { count: affected }),
          })
        : summary}
    </Text>
  );
}

/** Staff pick the focus date from the dates the edit reaches, a few at a time around the pick. */
function DateStrip(props: {
  readonly dates: readonly string[];
  readonly value: string;
  readonly onChange: (date: string) => void;
}) {
  const { dates, value, onChange } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  if (dates.length < 2) return null;
  const at = Math.max(0, dates.indexOf(value));
  const start = Math.max(0, Math.min(at - Math.floor(STRIP_SIZE / 2), dates.length - STRIP_SIZE));
  const segments = dates.slice(start, start + STRIP_SIZE).map((d) => ({
    id: d,
    label: format.formatCalendarDate(d, { weekday: "short", day: "numeric" }),
  }));
  return (
    <SegmentedControl
      size="sm"
      aria-label={t("availability.preview.date")}
      segments={segments}
      value={value}
      onChange={onChange}
    />
  );
}

/** Why a date has no times: the day's name ("Closed", a schedule) and any guest message. */
function NoTimes(props: { readonly day: PreviewResult["focusDay"] }) {
  const { day } = props;
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Text variant="label" color="primary">
        {t("availability.preview.noTimes")}
      </Text>
      <Text variant="caption" color="secondary">
        {day.label}
      </Text>
      {day.guestMessage && (
        <Text variant="caption" color="secondary">
          {day.guestMessage}
        </Text>
      )}
    </Stack>
  );
}

function FocusTimes(props: {
  readonly result: PreviewResult;
  readonly focusDate: string;
  readonly format: VenueFormat;
}) {
  const { result, focusDate, format } = props;
  const { t } = useTranslation();
  const day = dayOf(result, focusDate);
  const added = day?.added ?? [];
  const removed = day?.removed ?? [];
  const services = result.focusDay.services ?? [];
  // An older API omits `services`; its count says the same thing.
  const noService = result.focusDay.services
    ? services.length === 0
    : result.focusDay.serviceCount === 0;
  const mark = (key: "added" | "removed", minute: number) => (
    <Tag key={`${key}-${minute}`} variant={key === "added" ? "success" : "error"}>
      {t(`availability.preview.${key}`, { time: minuteText(minute, t, format) })}
    </Tag>
  );
  return (
    <Stack gap="xs">
      {noService && <NoTimes day={result.focusDay} />}
      {services.map((s) => (
        <Text key={s.venueServiceId} variant="caption" color="secondary">
          {t("availability.editor.serviceLine", {
            name: s.name,
            from: minuteText(s.opensAt, t, format),
            to: minuteText(s.closesAt, t, format),
          })}
        </Text>
      ))}
      <div className={styles.marks}>
        {added.map((m) => mark("added", m))}
        {removed.map((m) => mark("removed", m))}
      </div>
    </Stack>
  );
}

/**
 * The guest preview (ux.md S4): what guests would gain and lose on the focus date under the
 * unsaved draft, and the bookings anywhere in the scope it would strand. The draft is debounced;
 * the last good result stays on screen, dimmed, while a newer one loads or fails. The summary and
 * the slow / unavailable messages share one live region that is mounted from the start, so the
 * first result is announced too.
 */
export function AvailabilityGuestPreview(props: AvailabilityGuestPreviewProps) {
  const { venueId, changes, scopeConflicts, dates } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  // A picked date holds only while the page keeps the same focus date and the pick stays in scope.
  const [picked, setPicked] = useState<{ base: string; date: string } | null>(null);
  const focusDate =
    picked && picked.base === props.focusDate && dates.includes(picked.date)
      ? picked.date
      : props.focusDate;
  const stripDates = useMemo(
    () => [...new Set([...dates, props.focusDate])].sort(),
    [dates, props.focusDate]
  );
  const draft = useMemo<PreviewAvailabilityBody>(
    () => ({ draft: { changes, scopeConflicts }, scope: [...dates], focusDate }),
    [changes, scopeConflicts, dates, focusDate]
  );
  const { body, pending } = useSettledBody(draft);
  const { result, isFetching, error, retry } = useAvailabilityPreview(venueId, body);
  const stale = pending || isFetching;

  return (
    <Card
      variant="flat"
      title={t("availability.preview.title")}
      subtitle={t("availability.preview.draft")}
    >
      <Stack gap="sm">
        <DateStrip
          dates={stripDates}
          value={focusDate}
          onChange={(date) => setPicked({ base: props.focusDate, date })}
        />
        <div aria-live="polite" className={stale ? styles.stale : undefined}>
          {result && <Summary result={result} date={focusDate} />}
          {error && (
            <Text variant="body" color="warning">
              {isSlow(error)
                ? t("availability.preview.slow")
                : t("availability.preview.unavailable")}
            </Text>
          )}
        </div>
        {error && (
          <Stack gap="xs">
            {!isSlow(error) && (
              <Text variant="caption" color="secondary">
                {t("availability.preview.unavailableHelp")}
              </Text>
            )}
            <div>
              <Button variant="secondary" size="sm" onClick={retry}>
                {t("availability.preview.retry")}
              </Button>
            </div>
          </Stack>
        )}
        {result ? (
          <div className={stale ? styles.stale : undefined} aria-busy={stale}>
            <Stack gap="sm">
              <FocusTimes result={result} focusDate={focusDate} format={format} />
              <StrandedList stranded={result.stranded} />
            </Stack>
          </div>
        ) : (
          !error && <Skeleton variant="text" lines={3} />
        )}
      </Stack>
    </Card>
  );
}

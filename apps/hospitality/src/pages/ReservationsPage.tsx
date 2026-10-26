import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useCallback, useMemo, useRef, useState, useReducer, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { z } from "zod";
import type { CreateReservationRequest, Reservation, Table } from "@mbe/types";
import { useUrlParams } from "../hooks/use-url-params.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationDisplay } from "../hooks/useReservationDisplay.js";
import { useTables } from "../hooks/useTables.js";
import { useStaffTonight } from "../hooks/useStaffTonight.js";
import { useCreateReservation } from "../hooks/useReservations.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { NewReservationDialog } from "../components/reservations/NewReservationDialog.js";
import { STATUS_BADGE_VARIANT, formatReservationTime } from "../utils/reservation-display.js";
import {
  parseReservationsIntent,
  stripReservationsIntent,
  SELECTED_PARAM,
} from "../utils/timeline-intent.js";
import { ordinalVisitLabel } from "../i18n/ordinal-visit.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { KpiStat } from "../components/KpiStat.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { PageHeader } from "../components/PageHeader";
import { deviceDate } from "../utils/service-day.js";
import styles from "./ReservationsPage.module.css";

/* ── URL filter schema ──────────────────────── */

const reservationsFilterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(deviceDate(new Date())),
  status: z.enum(["all", "CONFIRMED", "PENDING", "CANCELLED"]).default("all"),
});

const RESERVATIONS_DEFAULTS = reservationsFilterSchema.parse({});

/* ── Status filter segments ────────────────── */

const STATUS_SEGMENT_IDS = ["all", "CONFIRMED", "PENDING", "CANCELLED"] as const;

/* ── Loading rows ───────────────────────────── */

const SKELETON_ROW_COUNT = 5;

/** ux.md Screen 8 loading: five text rows in the table region, one `role=status` sentence. */
function ReservationsLoadingRows() {
  const { t } = useTranslation();
  return (
    <div className={styles.loading} role="status" aria-busy="true">
      <Text as="span" className={styles.srOnly}>
        {t("reservations.loading")}
      </Text>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} variant="text" width="100%" />
      ))}
    </div>
  );
}

/* ── Table name resolution (#4986 — never surface a raw tbl_ id) ────────────── */

/**
 * A reservation's embedded `table` relation wins; falling back to the
 * venue's tables query by id covers the (common) shape where the list
 * endpoint doesn't hydrate the relation. Never falls through to the raw
 * `tableId` — that's the recognition failure this resolver exists to fix.
 */
function resolveTableName(
  reservation: Reservation,
  tablesById: Map<string, Table>,
  t: TFunction
): string {
  return (
    reservation.table?.name ??
    tablesById.get(reservation.tableId)?.name ??
    t("reservations.tableUnavailable")
  );
}

/* ── Relative time formatter ────────────────── */

function formatRelativeTime(date: Date, t: TFunction): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return t("reservations.relative.justNow");
  if (seconds < 60) return t("reservations.relative.seconds", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("reservations.relative.minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t("reservations.relative.hours", { n: hours });
}

/* ── Main component ─────────────────────────── */

export function ReservationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useVenueFormat();
  const { selectedVenueId } = useVenue();
  const { params, setParam } = useUrlParams(reservationsFilterSchema, RESERVATIONS_DEFAULTS);
  const selectedDate = params.date;
  const statusFilter = params.status;
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showNewReservationDialog, setShowNewReservationDialog] = useState(false);
  // ⌘K "New Reservation" lands here as `?new=true` (architecture § Amendment 2026-09-04): the
  // intent is derived on render — no state, no effect — and stripped when the dialog closes.
  const [searchParams, setSearchParams] = useSearchParams();
  const intent = parseReservationsIntent(searchParams);
  // The dialog's date is a service day: with no `?date`, "today" is the service running now
  // (00:30 Friday is still Thursday's), not the calendar date the list defaults to.
  const tonight = useStaffTonight(selectedVenueId);
  const dialogDate = searchParams.has("date")
    ? selectedDate
    : (tonight.serviceDate ?? selectedDate);
  const newReservationButtonRef = useRef<HTMLButtonElement>(null);
  const { status, announce } = useStatusMessage();
  const { focusAfter } = useFocusAfter();

  const {
    data,
    stats,
    filteredData: filteredReservations,
    isLoading,
    error: queryError,
    refetch,
  } = useReservationDisplay({
    date: selectedDate,
    venueId: selectedVenueId ?? undefined,
    statusFilter,
    searchQuery,
  });

  const { data: tables, isLoading: tablesLoading } = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: 100,
    enabled: !!selectedVenueId,
  });
  const tablesById = useMemo(
    () => new Map((tables ?? []).map((table) => [table.id, table])),
    [tables]
  );
  const { mutateAsync: createReservation } = useCreateReservation();

  const errorDescription = queryError ? describeApiError(queryError) : null;
  const dateLabel = fmt.formatServiceDate(selectedDate);

  const handleRetry = useCallback(async () => {
    const result = await refetch();
    if (result.error) return;
    announce(t("reservations.loaded", { date: dateLabel }));
    focusAfter({ kind: "pageHeading" });
  }, [refetch, announce, focusAfter, dateLabel, t]);

  const closeNewReservationDialog = useCallback(() => {
    setShowNewReservationDialog(false);
    setSearchParams((prev) => stripReservationsIntent(prev), { replace: true });
  }, [setSearchParams]);

  const handleCreateReservation = async (reservationData: CreateReservationRequest) => {
    await createReservation(reservationData);
    closeNewReservationDialog();
    focusAfter({ kind: "pageHeading" });
  };

  const handleCloseNewReservation = () => {
    const openedFromUrl = intent.newReservation;
    closeNewReservationDialog();
    // A URL-opened dialog captured `body` as the element to restore, so its own restore would
    // drop focus; land it where a click-open would have — the New reservation button (ux.md
    // Decision (d)). A click-opened dialog keeps its own restore.
    if (openedFromUrl && newReservationButtonRef.current) {
      focusAfter({ kind: "element", element: newReservationButtonRef.current });
    }
  };

  /* Keep the "Updated Xs ago" display current by forcing re-render every 5s */
  const [, forceDisplayTick] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (!data) return;
    setLastUpdated(new Date());
  }, [data]);

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(forceDisplayTick, 5_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const lastUpdatedDisplay = lastUpdated ? formatRelativeTime(lastUpdated, t) : "";

  const showLoading = isLoading && (data === undefined || data.length === 0);
  const loaded = !isLoading && !errorDescription;
  // KPIs are honest about not knowing: "—" (spoken "unavailable") until data lands, never 0.
  const kpisUnknown = showLoading || errorDescription !== null;
  const kpi = (value: number) => (kpisUnknown ? null : value);
  const dayIsEmpty = loaded && (data ?? []).length === 0;

  return (
    <div className={styles.container}>
      <PageHeader title={t("reservations.title")} description={t("reservations.description")} />
      <LiveStatus status={status} />

      <div data-testid="primary-content">
        {lastUpdatedDisplay && (
          <div className={styles.statusBar}>
            <Text variant="caption" color="secondary">
              {t("reservations.updated", { when: lastUpdatedDisplay })}
            </Text>
          </div>
        )}

        <div className={styles.statsRow}>
          <KpiStat label={t("reservations.kpi.total")} value={kpi(stats.total)} />
          <KpiStat label={t("reservations.kpi.confirmed")} value={kpi(stats.confirmed)} />
          <KpiStat label={t("reservations.kpi.pending")} value={kpi(stats.pending)} />
          <KpiStat label={t("reservations.kpi.cancelled")} value={kpi(stats.cancelled)} />
        </div>

        <div className={styles.toolbar}>
          <SegmentedControl
            segments={STATUS_SEGMENT_IDS.map((id) => ({
              id,
              label: t(`reservations.filter.${id}`),
            }))}
            value={statusFilter}
            onChange={(value) => {
              setParam("status", value as typeof params.status);
            }}
            size="sm"
          />
          <Input
            aria-label={t("reservations.search.label")}
            placeholder={t("reservations.search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Input
            aria-label={t("reservations.filterDate")}
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setParam("date", e.target.value);
            }}
          />
          <Button
            ref={newReservationButtonRef}
            variant="primary"
            size="sm"
            onClick={() => setShowNewReservationDialog(true)}
            disabled={!selectedVenueId}
          >
            {t("reservations.newReservation")}
          </Button>
        </div>

        {errorDescription && (
          <div className={styles.banner}>
            <ErrorRetryBanner
              title={t("reservations.loadFailed")}
              error={errorDescription.detail}
              details={errorDescription.raw}
              onRetry={handleRetry}
            />
          </div>
        )}

        {showLoading && <ReservationsLoadingRows />}

        {loaded && (
          <Text className={styles.srOnly} aria-live="polite" role="status">
            {t("reservations.shown", { count: filteredReservations.length })}
          </Text>
        )}

        {dayIsEmpty && (
          <EmptyState
            variant="flat"
            heading={t("reservations.emptyDay.heading", { date: dateLabel })}
            description={t("reservations.emptyDay.description")}
            action={
              <Button
                variant="secondary"
                onClick={() => setShowNewReservationDialog(true)}
                disabled={!selectedVenueId}
              >
                {t("reservations.newReservation")}
              </Button>
            }
          />
        )}

        {loaded && !dayIsEmpty && filteredReservations.length === 0 && (
          <EmptyState
            heading={t("reservations.none.heading")}
            description={
              searchQuery.trim()
                ? t("reservations.none.matching", { query: searchQuery.trim() })
                : t(`reservations.none.forStatus.${statusFilter}`, { date: dateLabel })
            }
          />
        )}

        {loaded && filteredReservations.length > 0 && (
          <Card>
            <div className={styles.tableWrapper}>
              {/* eslint-disable mbe-local/prefer-rialto-components -- HTML table elements are correct here; Rialto Table has a different API */}
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>{t("reservations.col.time")}</th>
                    <th className={styles.th}>{t("reservations.col.guest")}</th>
                    <th className={styles.th}>{t("reservations.col.partySize")}</th>
                    <th className={styles.th}>{t("reservations.col.table")}</th>
                    <th className={styles.th}>{t("reservations.col.status")}</th>
                    <th className={styles.th}>{t("reservations.col.notes")}</th>
                    <th className={styles.th}>{t("reservations.col.actions")}</th>
                  </tr>
                </thead>
                <tbody className={styles.tbody}>
                  {filteredReservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td className={styles.td}>
                        {formatReservationTime(reservation.startTime, fmt.locale, fmt.timeZone)} -{" "}
                        {formatReservationTime(reservation.endTime, fmt.locale, fmt.timeZone)}
                      </td>
                      <td className={styles.td}>
                        <Text variant="body" color="primary" className={styles.guestName}>
                          {reservation.guestName ?? t("reservations.guestFallback")}
                        </Text>
                        {reservation.guestEmail && (
                          <Text variant="caption" color="secondary">
                            {reservation.guestEmail}
                          </Text>
                        )}
                        {reservation.guest && reservation.guest.visitCount > 1 && (
                          <Badge variant="accent" size="sm">
                            {ordinalVisitLabel(t, i18n.language, reservation.guest.visitCount)}
                          </Badge>
                        )}
                      </td>
                      <td className={styles.td}>{reservation.partySize}</td>
                      <td className={styles.td}>{resolveTableName(reservation, tablesById, t)}</td>
                      <td className={styles.td}>
                        <Badge variant={STATUS_BADGE_VARIANT[reservation.status]}>
                          {t(`reservations.status.${reservation.status}`)}
                        </Badge>
                      </td>
                      <td className={styles.tdMuted}>{reservation.notes ?? "-"}</td>
                      <td className={styles.td}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/timeline?date=${reservation.date}&${SELECTED_PARAM}=${reservation.id}`
                            )
                          }
                          aria-label={t("reservations.viewAria", {
                            name: reservation.guestName ?? t("reservations.guestFallback"),
                          })}
                        >
                          {t("reservations.view")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* eslint-enable mbe-local/prefer-rialto-components */}
            </div>
          </Card>
        )}
      </div>

      {/* The dialog seeds its table from `tables` once, at mount — a URL-open must not race the query. */}
      {(intent.newReservation || showNewReservationDialog) && selectedVenueId && !tablesLoading && (
        <NewReservationDialog
          tables={tables ?? []}
          venueId={selectedVenueId}
          defaultDate={dialogDate}
          followServiceDay={!searchParams.has("date")}
          onConfirm={handleCreateReservation}
          onClose={handleCloseNewReservation}
        />
      )}
    </div>
  );
}

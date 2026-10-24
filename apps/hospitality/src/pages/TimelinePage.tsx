import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { useUrlParams } from "../hooks/use-url-params.js";
import { Button, Card, Drawer, EmptyState, IconButton, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, TableStatus, UpdateReservationRequest, WalkInRequest } from "@mbe/types";
import {
  ReservationSheet,
  TimelineGrid,
  TimelineMobileView,
  TimelineSkeleton,
} from "../components/timeline";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog";
import { MarkNoShowDialog } from "../components/timeline/MarkNoShowDialog.js";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer";
import { WalkInDialog } from "../components/timeline/WalkInDialog";
import { ReservationDetails } from "../components/timeline/ReservationDetails.js";
import { tableStatusInline } from "../components/timeline/table-status-menu.js";
// By path, not the barrel: TimelinePage.test.tsx mocks the barrel wholesale.
import { SHEET_BLOCK_SIZE, reservationSheetSize } from "../components/timeline/sheet-size.js";
import { RehearsalTimeline } from "../components/rehearsal/RehearsalTimeline.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { KpiStat } from "../components/KpiStat.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { OfflineBanner } from "../components/OfflineBanner.js";
import { PageHeader } from "../components/PageHeader";
import { useVenue } from "../contexts/VenueContext.js";
import { useSSEStatus } from "../hooks/useSSESync.js";
import { useTables } from "../hooks/useTables.js";
import { useTimelineData } from "../hooks/useTimelineData.js";
import { useCancellationQuote } from "../hooks/useCancellationQuote.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { useNow } from "../hooks/useNow.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useViewport } from "../hooks/useViewport.js";
import { describeApiError, type ApiErrorDescription } from "../lib/describe-api-error.js";
import { formatLongDateWithYear, formatServiceDate } from "../utils/format.js";
import { deviceDate } from "../utils/service-day.js";
import { seatedReservationIds } from "../utils/seated.js";
import {
  REHEARSAL_PARAM,
  parseTimelineIntent,
  stripTimelineIntent,
} from "../utils/timeline-intent.js";
import styles from "./TimelinePage.module.css";

/* ── URL filter schema ──────────────────────── */

const timelineFilterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(deviceDate(new Date())),
});

const TIMELINE_DEFAULTS = timelineFilterSchema.parse({});

/* ── Sentences (ux.md § Copy, `role=status` column) ── */

/** A status change the API refused — the banner's Retry re-sends exactly this transition. */
interface TableStatusFailure {
  readonly tableId: string;
  readonly next: TableStatus;
  readonly error: ApiErrorDescription;
}

function walkInSentence(created: Reservation, tableName: string | undefined, t: TFunction): string {
  const who = created.guestName ? created.guestName : t("timeline.announce.aWalkIn");
  const size = created.partySize;
  return tableName
    ? t("timeline.announce.walkInSeatedAt", { who, size, table: tableName })
    : t("timeline.announce.walkInSeated", { who, size });
}

function seatedSentence(
  reservation: Reservation,
  tableName: string | undefined,
  t: TFunction
): string {
  const guest = reservation.guestName || t("timeline.announce.theGuest");
  return tableName
    ? t("timeline.announce.seatedAt", { guest, table: tableName })
    : t("timeline.announce.seated", { guest });
}

/** One sentence per named/unnamed case — a possessive cannot be assembled across languages. */
function cancelledSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.cancelledNamed", { name: reservation.guestName })
    : t("timeline.announce.cancelled");
}

function noShowSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.noShowNamed", { name: reservation.guestName })
    : t("timeline.announce.noShow");
}

function savedSentence(reservation: Reservation, t: TFunction): string {
  return reservation.guestName
    ? t("timeline.announce.savedNamed", { name: reservation.guestName })
    : t("timeline.announce.saved");
}

function loadedSentence(date: string, todayStr: string, locale: string, t: TFunction): string {
  return date === todayStr
    ? t("timeline.announce.loadedTonight")
    : t("timeline.announce.loadedDate", { date: formatServiceDate(date, locale) });
}

/** The grid block's test id — `useFocusAfter`'s target after a mutation lands on a party. */
function blockTestId(reservationId: string): string {
  return `reservation-block-${reservationId}`;
}

/* ── Icons ──────────────────────────────────── */

function ChevronLeftIcon() {
  return (
    <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className={styles.navIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className={styles.closeIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/* ── Page ───────────────────────────────────── */

/**
 * The Timeline orchestrator (architecture § `pages/TimelinePage.tsx`): selection by id, the URL
 * intent read on render, the load axis and the mutation axis kept apart. Dialogs and the detail
 * surfaces own their own failures (they reject); this page owns outcomes — the selection, the one
 * `role=status` sentence and the focus target that follow a success.
 */
function LiveTimelinePage() {
  const { t } = useTranslation();
  const { selectedVenueId, selectedVenue } = useVenue();
  const fmt = useVenueFormat();
  const { isConnected } = useSSEStatus();
  const viewport = useViewport();
  const now = useNow();
  const { status, announce } = useStatusMessage();
  const { focusAfter } = useFocusAfter();

  const { params, setParam } = useUrlParams(timelineFilterSchema, TIMELINE_DEFAULTS);
  // The Walk-in controls elsewhere (⌘K, Dashboard) and the Waitlist hand-off land here as
  // `?walkin=true` / `?selected=<id>`: derived on render, stripped on every close or success.
  const [searchParams, setSearchParams] = useSearchParams();
  const intent = parseTimelineIntent(searchParams);
  const todayStr = deviceDate(now);
  const selectedDate = params.date;

  const [selectedIdState, setSelectedIdState] = useState<string | null>(null);
  // The tablet sheet's More ▾, keyed by reservation so a new selection opens collapsed.
  const [sheetExpandedFor, setSheetExpandedFor] = useState<string | null>(null);
  const selectedId = intent.selectedId ?? selectedIdState;
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNoShowDialog, setShowNoShowDialog] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showWalkInDialog, setShowWalkInDialog] = useState(false);
  const [dismissedLoadError, setDismissedLoadError] = useState<Error | null>(null);
  const [pendingTableId, setPendingTableId] = useState<string | null>(null);
  const [tableStatusFailure, setTableStatusFailure] = useState<TableStatusFailure | null>(null);
  const walkInButtonRef = useRef<HTMLButtonElement>(null);
  // Captured at event time (architecture § Decisions): the Edit button that opened the drawer.
  const editOpenerRef = useRef<HTMLElement | null>(null);
  // Captured at event time, same pattern: whichever control opened the Walk-in dialog (the
  // toolbar button or the quiet-night CTA — #5272) is where every dismissal path restores focus.
  const walkInOpenerRef = useRef<HTMLElement | null>(null);
  const walkInCaptionId = useId();

  const {
    reservations,
    tables,
    isLoading,
    fetchError,
    stats,
    isFromCache,
    lastSyncedAt,
    refetch,
    seatGuest,
    cancelReservation,
    updateReservation,
    markNoShow,
    createWalkIn,
    updateTableStatus,
  } = useTimelineData({ venueId: selectedVenueId ?? undefined, date: selectedDate });

  // Derived from the id so the panel is never stale after a refetch.
  const selectedReservation = useMemo(
    () => (selectedId ? (reservations.find((r) => r.id === selectedId) ?? null) : null),
    [reservations, selectedId]
  );
  const sheetExpanded = selectedReservation !== null && sheetExpandedFor === selectedReservation.id;
  const toggleSheetExpanded = () =>
    setSheetExpandedFor(sheetExpanded ? null : (selectedReservation?.id ?? null));
  const seatedIds = useMemo(
    () => seatedReservationIds(reservations, tables, now),
    [reservations, tables, now]
  );

  // Derive the cancellation quote (fee + label) from the venue policy and the
  // selected reservation's time — one source for both the dialog display and
  // the executed cancel mutation.
  const { quote: cancellationQuote } = useCancellationQuote({
    slug: selectedVenue?.slug,
    reservationTime: selectedReservation ? new Date(selectedReservation.startTime) : undefined,
    currency: selectedVenue?.currencyCode?.toLowerCase(),
  });

  const tableName = (tableId: string): string | undefined =>
    tables.find((table) => table.id === tableId)?.name;

  /* ── URL intent ── */

  const stripIntent = useCallback(() => {
    setSearchParams((prev) => stripTimelineIntent(prev), { replace: true });
  }, [setSearchParams]);

  const selectReservation = useCallback(
    (reservation: Reservation) => {
      setSelectedIdState(reservation.id);
      if (intent.selectedId) stripIntent();
    },
    [intent.selectedId, stripIntent]
  );

  const clearSelection = () => {
    setSelectedIdState(null);
    setSheetExpandedFor(null);
    stripIntent();
  };

  const closeWalkInDialog = () => {
    setShowWalkInDialog(false);
    stripIntent();
  };

  const openWalkInDialog = () => {
    const active = document.activeElement;
    walkInOpenerRef.current = active instanceof HTMLElement ? active : null;
    setShowWalkInDialog(true);
  };

  const handleWalkInClose = () => {
    const openedFromUrl = intent.walkIn;
    closeWalkInDialog();
    // A URL-opened dialog has no opener to restore; land focus where a click-open would have — the
    // Walk-in button (ux.md Decision (d)). A click-opened dialog restores its own captured opener —
    // the toolbar button or the quiet-night CTA (#5272) — on all three dismissal paths (Escape,
    // Cancel, overlay-click all route through this one `onClose`).
    const target = openedFromUrl ? walkInButtonRef.current : walkInOpenerRef.current;
    if (target) focusAfter({ kind: "element", element: target });
  };

  /* ── Day navigation ── */

  const shiftDay = (days: number) => {
    const shifted = new Date(`${selectedDate}T00:00:00`);
    shifted.setDate(shifted.getDate() + days);
    setParam("date", deviceDate(shifted));
  };

  const handlePreviousDay = () => shiftDay(-1);
  const handleNextDay = () => shiftDay(1);
  const handleToday = () => setParam("date", todayStr);
  const handleRehearse = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(REHEARSAL_PARAM, "true");
      return next;
    });

  /* ── Load axis ── */

  const handleRetry = async () => {
    try {
      await refetch();
    } catch {
      // `fetchError` re-renders the banner or empty state; focus stays on Retry (ux.md Flow 2).
      return;
    }
    announce(loadedSentence(selectedDate, todayStr, fmt.locale, t));
    focusAfter({ kind: "pageHeading" });
  };

  /* ── Mutation axis: the dialogs reject on failure, so only success reaches here ── */

  const handleSeat = async (reservation: Reservation) => {
    await seatGuest(reservation);
    announce(seatedSentence(reservation, tableName(reservation.tableId), t));
    focusAfter({ kind: "testId", testId: blockTestId(reservation.id) });
  };

  const handleCancel = async (reason: string, note: string) => {
    if (!selectedReservation) return;
    await cancelReservation(selectedReservation.id, { reason, note, quote: cancellationQuote });
    setShowCancelDialog(false);
    clearSelection();
    announce(cancelledSentence(selectedReservation, t));
    focusAfter({ kind: "testId", testId: blockTestId(selectedReservation.id) });
  };

  // The backend's NO_SHOW transition (recordNoShow, services/reservations) captures any held
  // deposit as a no-show fee via the same Stripe capture plumbing deposits already use, and may
  // return a `warning` when something non-fatal needs staff attention (e.g. the deposit was still
  // pending, or was written off as uncollectable — #5719 M2). Rejects on failure; MarkNoShowDialog
  // owns showing it.
  const handleMarkNoShow = async () => {
    if (!selectedReservation) return;
    const { reservation: updated, warning } = await markNoShow(selectedReservation.id);
    setShowNoShowDialog(false);
    clearSelection();
    const sentence = noShowSentence(selectedReservation, t);
    announce(warning ? t("timeline.announce.withWarning", { sentence, warning }) : sentence);
    focusAfter({ kind: "testId", testId: blockTestId(updated.id) });
  };

  const openEditDrawer = () => {
    const active = document.activeElement;
    editOpenerRef.current = active instanceof HTMLElement ? active : null;
    setShowEditDrawer(true);
  };

  const handleEdit = async (id: string, data: UpdateReservationRequest) => {
    const updated = await updateReservation(id, data);
    setShowEditDrawer(false);
    announce(savedSentence(updated, t));
    const opener = editOpenerRef.current;
    if (opener) focusAfter({ kind: "element", element: opener });
  };

  const handleWalkIn = async (data: WalkInRequest) => {
    const created = await createWalkIn(data);
    setSelectedIdState(created.id);
    closeWalkInDialog();
    announce(walkInSentence(created, tableName(created.tableId) ?? created.table?.name, t));
    focusAfter({ kind: "testId", testId: blockTestId(created.id) });
  };

  const handleTableStatusChange = async (tableId: string, next: TableStatus) => {
    setTableStatusFailure(null);
    setPendingTableId(tableId);
    try {
      await updateTableStatus(tableId, next);
      announce(
        t("timeline.announce.tableNow", {
          table: tableName(tableId) ?? t("timeline.announce.aTable"),
          status: tableStatusInline(next, t, fmt.locale),
        })
      );
    } catch (err) {
      setTableStatusFailure({ tableId, next, error: describeApiError(err) });
    } finally {
      // The trigger is disabled while pending; focus lands in the commit that re-enables it.
      setPendingTableId(null);
      focusAfter({ kind: "testId", testId: `table-status-${tableId}` });
    }
  };

  /* ── Render facts ── */

  const formattedDate = formatLongDateWithYear(selectedDate, fmt.locale);
  const isToday = selectedDate === todayStr;

  const loadFailure = fetchError ? describeApiError(fetchError) : null;
  const nothingLoaded = fetchError !== null && tables.length === 0;
  const showLoadBanner =
    loadFailure !== null && !nothingLoaded && fetchError !== dismissedLoadError;
  // "—" until the numbers are real (ux.md Screen 2): never 0 before data, never 0 after a failure.
  const statsReady = !isLoading && fetchError === null;
  const kpi = (value: number): number | null => (statsReady ? value : null);
  const walkInDisabled = nothingLoaded;
  const walkInDialogOpen = (intent.walkIn || showWalkInDialog) && !isLoading && !!selectedVenueId;
  // An empty book is only a quiet night when the fetch succeeded (ux.md Screen 7).
  const quietNight = reservations.length === 0 && fetchError === null;

  const detailSurface = selectedReservation && (
    <ReservationDetails
      reservation={selectedReservation}
      tables={tables}
      seated={seatedIds.has(selectedReservation.id)}
      now={now}
      onEdit={openEditDrawer}
      onSeat={() => handleSeat(selectedReservation)}
      onCancel={() => setShowCancelDialog(true)}
      onMarkNoShow={() => setShowNoShowDialog(true)}
    />
  );

  function renderGridArea() {
    if (isLoading) return <TimelineSkeleton />;
    if (nothingLoaded && loadFailure) {
      return (
        <EmptyState
          variant="flat"
          heading={t("timeline.page.loadFailedHeading")}
          description={loadFailure.detail}
          action={
            <Button variant="secondary" size="md" onClick={handleRetry}>
              {t("timeline.page.retry")}
            </Button>
          }
        />
      );
    }
    if (tables.length === 0) {
      return (
        <EmptyState
          variant="flat"
          heading={t("timeline.page.noTablesHeading")}
          description={t("timeline.page.noTablesDescription")}
          action={
            <Link to="/floor-plans" className={styles.emptyStateLink}>
              {t("timeline.page.floorPlans")}
            </Link>
          }
        />
      );
    }
    if (viewport === "phone") {
      return (
        <TimelineMobileView
          reservations={reservations}
          tables={tables}
          onReservationClick={selectReservation}
          selectedReservationId={selectedId}
          seatedIds={seatedIds}
        />
      );
    }
    return (
      <TimelineGrid
        tables={tables}
        reservations={reservations}
        date={selectedDate}
        onReservationClick={selectReservation}
        selectedReservationId={selectedId ?? undefined}
        onTableStatusChange={handleTableStatusChange}
        seatedIds={seatedIds}
        pendingTableId={pendingTableId}
        bottomInset={
          viewport === "tablet" && selectedReservation
            ? SHEET_BLOCK_SIZE[reservationSheetSize(selectedReservation.notes, sheetExpanded)]
            : undefined
        }
        emptyNight={
          quietNight
            ? {
                variant: isToday ? "today" : "otherDate",
                dateLabel: formatServiceDate(selectedDate, fmt.locale),
                onWalkIn: openWalkInDialog,
                onToday: handleToday,
                onRehearse: handleRehearse,
              }
            : null
        }
      />
    );
  }

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <PageHeader
            title={t("timeline.page.title")}
            description={t("timeline.page.description")}
          />
        </div>

        {/* Date navigation */}
        <div className={styles.dateNav} data-testid="date-navigation">
          <div className={styles.dateNavLeft}>
            <IconButton
              icon={<ChevronLeftIcon />}
              aria-label={t("timeline.page.previousDay")}
              variant="ghost"
              size="md"
              onClick={handlePreviousDay}
              className={styles.navButton}
            />
            <div className={styles.dateLabel}>{formattedDate}</div>
            <IconButton
              icon={<ChevronRightIcon />}
              aria-label={t("timeline.page.nextDay")}
              variant="ghost"
              size="md"
              onClick={handleNextDay}
              className={styles.navButton}
            />
            {!isToday && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleToday}
                className={styles.todayButton}
              >
                {t("timeline.page.today")}
              </Button>
            )}
            <Button
              ref={walkInButtonRef}
              variant="primary"
              size="md"
              onClick={openWalkInDialog}
              className={styles.walkInButton}
              disabled={walkInDisabled}
              aria-describedby={walkInDisabled ? walkInCaptionId : undefined}
            >
              {t("timeline.page.walkIn")}
            </Button>
            {walkInDisabled && (
              <Text
                as="span"
                id={walkInCaptionId}
                variant="caption"
                color="secondary"
                className={styles.walkInCaption}
              >
                {t("timeline.page.walkInDisabled")}
              </Text>
            )}
          </div>

          {/* Stats */}
          <div className={styles.statsRow} data-testid="timeline-stats">
            {/* Live indicator */}
            <div className={styles.liveIndicator}>
              <Text
                className={`${styles.liveDot} ${isConnected ? styles.liveDotConnected : styles.liveDotOffline}`}
              />
              <Text className={isConnected ? styles.liveTextConnected : styles.liveTextOffline}>
                {isConnected ? t("timeline.page.live") : t("timeline.page.offline")}
              </Text>
            </div>
            <KpiStat label={t("timeline.page.kpiReservations")} value={kpi(stats.total)} />
            <KpiStat label={t("timeline.page.kpiCovers")} value={kpi(stats.totalCovers)} />
            <KpiStat label={t("timeline.status.confirmed")} value={kpi(stats.confirmed)} />
            <KpiStat label={t("timeline.status.pending")} value={kpi(stats.pending)} />
          </div>
        </div>
      </div>

      <LiveStatus status={status} />

      {(isFromCache || !isConnected) && <OfflineBanner lastSyncedAt={lastSyncedAt} />}

      {/* Main content */}
      <div className={styles.content} data-testid="primary-content">
        {/* Timeline */}
        <div className={styles.timelineArea}>
          {showLoadBanner && loadFailure && (
            <ErrorRetryBanner
              title={t("timeline.page.loadBanner")}
              error={loadFailure.detail}
              details={loadFailure.raw}
              onRetry={handleRetry}
              onDismiss={() => setDismissedLoadError(fetchError)}
            />
          )}
          {tableStatusFailure && (
            <ErrorRetryBanner
              title={t("timeline.page.tableStatusBanner")}
              error={tableStatusFailure.error.detail}
              details={tableStatusFailure.error.raw}
              onRetry={() =>
                void handleTableStatusChange(tableStatusFailure.tableId, tableStatusFailure.next)
              }
              onDismiss={() => setTableStatusFailure(null)}
            />
          )}
          {renderGridArea()}
        </div>

        {/* Desktop (≥ 1025 px): the detail sidebar */}
        {viewport === "desktop" && selectedReservation && (
          <Card
            className={styles.sidebar}
            variant="elevated"
            data-testid="reservation-detail-sidebar"
          >
            <div className={styles.sidebarHeader}>
              <Text variant="display" as="h2" className={styles.sidebarTitle}>
                {t("timeline.page.detailsTitle")}
              </Text>
              <IconButton
                icon={<CloseIcon />}
                aria-label={t("timeline.page.closeDetails")}
                variant="ghost"
                size="md"
                onClick={clearSelection}
                className={styles.closeButton}
              />
            </div>
            {detailSurface}
          </Card>
        )}
      </div>

      {/* Tablet (768–1024 px): the bottom sheet */}
      {viewport === "tablet" && selectedReservation && (
        <ReservationSheet
          reservation={selectedReservation}
          tables={tables}
          seated={seatedIds.has(selectedReservation.id)}
          now={now}
          open
          onClose={clearSelection}
          onSeat={() => handleSeat(selectedReservation)}
          onEdit={openEditDrawer}
          onCancel={() => setShowCancelDialog(true)}
          onMarkNoShow={() => setShowNoShowDialog(true)}
          expanded={sheetExpanded}
          onToggleExpanded={toggleSheetExpanded}
        />
      )}

      {/* Phone (< 768 px): the right drawer */}
      {viewport === "phone" && (
        <Drawer
          side="right"
          size="default"
          open={selectedReservation !== null}
          onClose={clearSelection}
          title={t("timeline.page.detailsTitle")}
        >
          {detailSurface}
        </Drawer>
      )}

      {/* Dialogs — each rejects on failure and owns its own banner */}
      {showCancelDialog && selectedReservation && (
        <CancelReservationDialog
          reservationId={selectedReservation.id}
          guestName={selectedReservation.guestName}
          onConfirm={handleCancel}
          onClose={() => {
            setShowCancelDialog(false);
            focusAfter({ kind: "testId", testId: blockTestId(selectedReservation.id) });
          }}
          quote={cancellationQuote}
        />
      )}
      {showNoShowDialog && selectedReservation && (
        <MarkNoShowDialog
          guestName={selectedReservation.guestName}
          onConfirm={handleMarkNoShow}
          onClose={() => {
            setShowNoShowDialog(false);
            focusAfter({ kind: "testId", testId: blockTestId(selectedReservation.id) });
          }}
        />
      )}
      {showEditDrawer && selectedReservation && (
        <EditReservationDrawer
          reservation={selectedReservation}
          tables={tables}
          onSave={handleEdit}
          onClose={() => setShowEditDrawer(false)}
        />
      )}
      {walkInDialogOpen && selectedVenueId && (
        <WalkInDialog
          tables={tables}
          venueId={selectedVenueId}
          onConfirm={handleWalkIn}
          onClose={handleWalkInClose}
        />
      )}
    </div>
  );
}

/**
 * Rehearsal mode (`?rehearsal=true`, Dress Rehearsal): the floor plan's tables are read, then a
 * client-side simulated service fills the grid. It mounts none of the live page's data or
 * mutation hooks, so it cannot write to the API.
 */
function RehearsalTimelinePage() {
  const { t } = useTranslation();
  const { selectedVenueId } = useVenue();
  const now = useNow();
  const { data: tables, isLoading } = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: 100,
    enabled: !!selectedVenueId,
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <PageHeader
            title={t("timeline.page.title")}
            description={t("timeline.page.description")}
          />
        </div>
      </div>
      <div className={styles.content} data-testid="primary-content">
        <div className={styles.timelineArea}>
          {isLoading || !tables ? (
            <TimelineSkeleton />
          ) : tables.length === 0 ? (
            <EmptyState
              variant="flat"
              heading={t("timeline.page.noTablesHeading")}
              description={t("timeline.page.noTablesDescription")}
              action={
                <Link to="/floor-plans" className={styles.emptyStateLink}>
                  {t("timeline.page.floorPlans")}
                </Link>
              }
            />
          ) : (
            <RehearsalTimeline tables={tables} date={deviceDate(now)} />
          )}
        </div>
      </div>
    </div>
  );
}

export function TimelinePage() {
  const [searchParams] = useSearchParams();
  return searchParams.get(REHEARSAL_PARAM) === "true" ? (
    <RehearsalTimelinePage />
  ) : (
    <LiveTimelinePage />
  );
}

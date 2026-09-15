import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { useUrlParams } from "../hooks/use-url-params.js";
import { Button, Card, Drawer, EmptyState, IconButton, Text } from "@mattbutlerengineering/rialto";
import type { Reservation, TableStatus, UpdateReservationRequest } from "@mbe/types";
import {
  ReservationSheet,
  TimelineGrid,
  TimelineMobileView,
  TimelineSkeleton,
} from "../components/timeline";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer";
import { WalkInDialog } from "../components/timeline/WalkInDialog";
import { ReservationDetails } from "../components/timeline/ReservationDetails.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { KpiStat } from "../components/KpiStat.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { OfflineBanner } from "../components/OfflineBanner.js";
import { PageHeader } from "../components/PageHeader";
import { useVenue } from "../contexts/VenueContext.js";
import { useSSEStatus } from "../hooks/useSSESync.js";
import { useTimelineData } from "../hooks/useTimelineData.js";
import { useCancellationQuote } from "../hooks/useCancellationQuote.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { useNow } from "../hooks/useNow.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useViewport } from "../hooks/useViewport.js";
import { describeApiError, type ApiErrorDescription } from "../lib/describe-api-error.js";
import { formatServiceDate } from "../utils/format.js";
import { localDateString } from "../utils/local-clock.js";
import { seatedReservationIds } from "../utils/seated.js";
import { parseTimelineIntent, stripTimelineIntent } from "../utils/timeline-intent.js";
import styles from "./TimelinePage.module.css";

/* ── URL filter schema ──────────────────────── */

const timelineFilterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(localDateString(new Date())),
});

const TIMELINE_DEFAULTS = timelineFilterSchema.parse({});

/* ── Sentences (ux.md § Copy, `role=status` column) ── */

const WALK_IN_DISABLED_CAPTION = "Walk-ins need the tables loaded — Retry above.";
/** The tablet sheet's height (rialto `Drawer size="compact"`: `min(40vh, 240px)`), kept clear of the grid. */
const SHEET_INSET_PX = 240;

/** A status change the API refused — the banner's Retry re-sends exactly this transition. */
interface TableStatusFailure {
  readonly tableId: string;
  readonly next: TableStatus;
  readonly error: ApiErrorDescription;
}

function atTable(tableName: string | undefined): string {
  return tableName ? ` at ${tableName}` : "";
}

function walkInSentence(created: Reservation, tableName: string | undefined): string {
  const who = created.guestName ? created.guestName : "a walk-in";
  const where = tableName ? `, at ${tableName}` : "";
  return `Seated ${who}, party of ${created.partySize}${where}.`;
}

function seatedSentence(reservation: Reservation, tableName: string | undefined): string {
  return `Seated ${reservation.guestName || "the guest"}${atTable(tableName)}.`;
}

function whoseReservation(reservation: Reservation): string {
  return reservation.guestName ? `${reservation.guestName}'s reservation` : "the reservation";
}

function loadedSentence(date: string, todayStr: string): string {
  return date === todayStr
    ? "Tonight's grid loaded."
    : `Reservations for ${formatServiceDate(date)} loaded.`;
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
export function TimelinePage() {
  const { selectedVenueId, selectedVenue } = useVenue();
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
  const todayStr = localDateString(now);
  const selectedDate = params.date;

  const [selectedIdState, setSelectedIdState] = useState<string | null>(null);
  const selectedId = intent.selectedId ?? selectedIdState;
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showWalkInDialog, setShowWalkInDialog] = useState(false);
  const [dismissedLoadError, setDismissedLoadError] = useState<Error | null>(null);
  const [pendingTableId, setPendingTableId] = useState<string | null>(null);
  const [tableStatusFailure, setTableStatusFailure] = useState<TableStatusFailure | null>(null);
  const walkInButtonRef = useRef<HTMLButtonElement>(null);
  // Captured at event time (architecture § Decisions): the Edit button that opened the drawer.
  const editOpenerRef = useRef<HTMLElement | null>(null);
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
    createWalkIn,
    updateTableStatus,
  } = useTimelineData({ venueId: selectedVenueId ?? undefined, date: selectedDate });

  // Derived from the id so the panel is never stale after a refetch.
  const selectedReservation = useMemo(
    () => (selectedId ? (reservations.find((r) => r.id === selectedId) ?? null) : null),
    [reservations, selectedId]
  );
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
    stripIntent();
  };

  const closeWalkInDialog = () => {
    setShowWalkInDialog(false);
    stripIntent();
  };

  const handleWalkInClose = () => {
    const openedFromUrl = intent.walkIn;
    closeWalkInDialog();
    // A URL-opened dialog captured `body` as the element to restore; land focus where a click-open
    // would have — the Walk-in button (ux.md Decision (d)). A click-opened dialog keeps its own.
    if (openedFromUrl && walkInButtonRef.current) {
      focusAfter({ kind: "element", element: walkInButtonRef.current });
    }
  };

  /* ── Day navigation ── */

  const shiftDay = (days: number) => {
    const shifted = new Date(`${selectedDate}T00:00:00`);
    shifted.setDate(shifted.getDate() + days);
    setParam("date", localDateString(shifted));
  };

  const handlePreviousDay = () => shiftDay(-1);
  const handleNextDay = () => shiftDay(1);
  const handleToday = () => setParam("date", todayStr);

  /* ── Load axis ── */

  const handleRetry = async () => {
    try {
      await refetch();
    } catch {
      // `fetchError` re-renders the banner or empty state; focus stays on Retry (ux.md Flow 2).
      return;
    }
    announce(loadedSentence(selectedDate, todayStr));
    focusAfter({ kind: "pageHeading" });
  };

  /* ── Mutation axis: the dialogs reject on failure, so only success reaches here ── */

  const handleSeat = async (reservation: Reservation) => {
    await seatGuest(reservation);
    announce(seatedSentence(reservation, tableName(reservation.tableId)));
    focusAfter({ kind: "testId", testId: blockTestId(reservation.id) });
  };

  const handleCancel = async (reason: string, note: string) => {
    if (!selectedReservation) return;
    await cancelReservation(selectedReservation.id, { reason, note, quote: cancellationQuote });
    setShowCancelDialog(false);
    clearSelection();
    announce(`Cancelled ${whoseReservation(selectedReservation)}.`);
    focusAfter({ kind: "testId", testId: blockTestId(selectedReservation.id) });
  };

  const openEditDrawer = () => {
    const active = document.activeElement;
    editOpenerRef.current = active instanceof HTMLElement ? active : null;
    setShowEditDrawer(true);
  };

  const handleEdit = async (id: string, data: UpdateReservationRequest) => {
    const updated = await updateReservation(id, data);
    setShowEditDrawer(false);
    announce(`Saved changes to ${whoseReservation(updated)}.`);
    const opener = editOpenerRef.current;
    if (opener) focusAfter({ kind: "element", element: opener });
  };

  const handleWalkIn = async (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => {
    const created = await createWalkIn(data);
    setSelectedIdState(created.id);
    closeWalkInDialog();
    announce(walkInSentence(created, tableName(created.tableId) ?? created.table?.name));
    focusAfter({ kind: "testId", testId: blockTestId(created.id) });
  };

  const handleTableStatusChange = async (tableId: string, next: TableStatus) => {
    setTableStatusFailure(null);
    setPendingTableId(tableId);
    try {
      await updateTableStatus(tableId, next);
      announce(`${tableName(tableId) ?? "Table"} is now ${next.toLowerCase()}.`);
    } catch (err) {
      setTableStatusFailure({ tableId, next, error: describeApiError(err) });
    } finally {
      // The trigger is disabled while pending; focus lands in the commit that re-enables it.
      setPendingTableId(null);
      focusAfter({ kind: "testId", testId: `table-status-${tableId}` });
    }
  };

  /* ── Render facts ── */

  const formattedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
      onEdit={openEditDrawer}
      onSeat={() => handleSeat(selectedReservation)}
      onCancel={() => setShowCancelDialog(true)}
    />
  );

  function renderGridArea() {
    if (isLoading) return <TimelineSkeleton />;
    if (nothingLoaded && loadFailure) {
      return (
        <EmptyState
          variant="flat"
          heading="Couldn't load tonight."
          description={loadFailure.detail}
          action={
            <Button variant="secondary" size="md" onClick={handleRetry}>
              Retry
            </Button>
          }
        />
      );
    }
    if (tables.length === 0) {
      return (
        <EmptyState
          variant="flat"
          heading="No tables yet."
          description="Set up a floor plan and the grid fills in."
          action={
            <Link to="/floor-plans" className={styles.emptyStateLink}>
              Floor plans
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
        bottomInset={viewport === "tablet" && selectedReservation ? SHEET_INSET_PX : undefined}
        emptyNight={
          quietNight
            ? {
                variant: isToday ? "today" : "otherDate",
                dateLabel: formatServiceDate(selectedDate),
                onWalkIn: () => setShowWalkInDialog(true),
                onToday: handleToday,
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
          <PageHeader title="Timeline" description="Real-time reservation view" />
        </div>

        {/* Date navigation */}
        <div className={styles.dateNav} data-testid="date-navigation">
          <div className={styles.dateNavLeft}>
            <IconButton
              icon={<ChevronLeftIcon />}
              aria-label="Previous day"
              variant="ghost"
              size="md"
              onClick={handlePreviousDay}
              className={styles.navButton}
            />
            <div className={styles.dateLabel}>{formattedDate}</div>
            <IconButton
              icon={<ChevronRightIcon />}
              aria-label="Next day"
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
                Today
              </Button>
            )}
            <Button
              ref={walkInButtonRef}
              variant="primary"
              size="md"
              onClick={() => setShowWalkInDialog(true)}
              className={styles.walkInButton}
              disabled={walkInDisabled}
              aria-describedby={walkInDisabled ? walkInCaptionId : undefined}
            >
              Walk-in
            </Button>
            {walkInDisabled && (
              <Text
                as="span"
                id={walkInCaptionId}
                variant="caption"
                color="secondary"
                className={styles.walkInCaption}
              >
                {WALK_IN_DISABLED_CAPTION}
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
                {isConnected ? "Live" : "Offline"}
              </Text>
            </div>
            <KpiStat label="Reservations" value={kpi(stats.total)} />
            <KpiStat label="Covers" value={kpi(stats.totalCovers)} />
            <KpiStat label="Confirmed" value={kpi(stats.confirmed)} />
            <KpiStat label="Pending" value={kpi(stats.pending)} />
          </div>
        </div>
      </div>

      <LiveStatus status={status} />

      {(isFromCache || !isConnected) && <OfflineBanner lastSyncedAt={lastSyncedAt} />}

      {/* Main content */}
      <div className={styles.content}>
        {/* Timeline */}
        <div className={styles.timelineArea}>
          {showLoadBanner && loadFailure && (
            <ErrorRetryBanner
              title="Couldn't load tonight's reservations."
              error={loadFailure.detail}
              details={loadFailure.raw}
              onRetry={handleRetry}
              onDismiss={() => setDismissedLoadError(fetchError)}
            />
          )}
          {tableStatusFailure && (
            <ErrorRetryBanner
              title="Table status not changed."
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
                Reservation Details
              </Text>
              <IconButton
                icon={<CloseIcon />}
                aria-label="Close reservation details"
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
          open
          onClose={clearSelection}
          onSeat={() => handleSeat(selectedReservation)}
          onEdit={openEditDrawer}
          onCancel={() => setShowCancelDialog(true)}
        />
      )}

      {/* Phone (< 768 px): the right drawer */}
      {viewport === "phone" && (
        <Drawer
          side="right"
          size="default"
          open={selectedReservation !== null}
          onClose={clearSelection}
          title="Reservation Details"
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
          onClose={() => setShowCancelDialog(false)}
          quote={cancellationQuote}
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

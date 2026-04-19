import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from "react";
import styles from "./TapeChart.module.css";
import { useDeviceContext } from "../../providers/useDeviceContext";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { EmptyState } from "../EmptyState/EmptyState";
import { Banner } from "../Banner/Banner";
import { Skeleton } from "../Skeleton/Skeleton";
import { TapeChartGrid } from "./TapeChartGrid";
import { TapeChartListView } from "./TapeChartListView";
import { TapeChartMobileStack } from "./TapeChartMobileStack";
import { TapeChartStatPills } from "./TapeChartStatPills";
import { useTapeChartI18n } from "./useTapeChartI18n";
import { useTapeChartLayout } from "./useTapeChartLayout";
import { mergeStrings } from "./defaultStrings";
import type {
  TapeChartProps,
  TapeChartReservation,
  TapeChartViewMode,
} from "./types";

function dayWidthForViewport(
  viewport: "mobile" | "tablet" | "desktop",
  pointer: "fine" | "coarse",
  override?: number,
): number {
  if (override != null) return override;
  if (viewport === "desktop") return 80;
  if (viewport === "tablet") return pointer === "coarse" ? 72 : 60;
  return 56;
}

export const TapeChart = forwardRef(function TapeChart(
  props: TapeChartProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    reservations,
    rooms,
    startDate,
    endDate,
    locale,
    timeZone,
    currency,
    density = "comfortable",
    dayWidth: dayWidthOverride,
    viewMode,
    defaultViewMode = "grid",
    onViewModeChange,
    onReservationClick,
    selectedReservationId,
    loading,
    error,
    onRetry,
    strings,
    className,
    toolbarSlot,
    emptyAction,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
    },
    [ref],
  );

  const device = useDeviceContext();
  const formatters = useTapeChartI18n(locale, timeZone, currency);
  const resolved = useMemo(() => mergeStrings(strings), [strings]);
  const layout = useTapeChartLayout(reservations, rooms, startDate, endDate);
  const todayISO = formatters.todayISO();

  const [internalViewMode, setInternalViewMode] = useState<TapeChartViewMode>(defaultViewMode);
  const activeViewMode = viewMode ?? internalViewMode;
  const handleViewModeChange = useCallback(
    (next: TapeChartViewMode) => {
      if (viewMode === undefined) setInternalViewMode(next);
      onViewModeChange?.(next);
    },
    [viewMode, onViewModeChange],
  );

  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);
  const handleReservationSelect = useCallback(
    (r: TapeChartReservation) => {
      setFocusedReservationId(r.id);
      onReservationClick?.(r);
    },
    [onReservationClick],
  );

  const dayWidth = dayWidthForViewport(device.viewport, device.pointer, dayWidthOverride);

  const rootStyle = {
    ["--tapechart-day-width" as string]: `${dayWidth}px`,
    ["--tapechart-day-count" as string]: layout.dayCount,
  };

  // ── Non-happy-path states ──────────────────
  if (error) {
    return (
      <div ref={setRefs} className={`${styles.root}${className ? " " + className : ""}`} data-density={density}>
        <Banner
          variant="error"
          action={
            onRetry ? (
              <button type="button" onClick={onRetry}>
                {resolved.errorRetryLabel}
              </button>
            ) : undefined
          }
        >
          <strong>{resolved.errorTitle}</strong>
          {error.message && <span> — {error.message}</span>}
        </Banner>
      </div>
    );
  }

  if (loading && reservations.length === 0 && rooms.length === 0) {
    return (
      <div
        ref={setRefs}
        className={`${styles.root}${className ? " " + className : ""}`}
        data-density={density}
        aria-busy="true"
        aria-label={resolved.loadingLabel}
      >
        <div className={styles.statPills}>
          <Skeleton variant="rect" width={120} height={32} />
          <Skeleton variant="rect" width={120} height={32} />
          <Skeleton variant="rect" width={120} height={32} />
        </div>
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`rh-${i}`} className={styles.skeletonCell} />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`lane-${i}`} className={styles.skeletonCell} />
          ))}
        </div>
      </div>
    );
  }

  if (!loading && rooms.length === 0) {
    return (
      <div ref={setRefs} className={`${styles.root}${className ? " " + className : ""}`} data-density={density}>
        <div className={styles.stateWrapper}>
          <EmptyState heading={resolved.emptyTitle} description={resolved.emptyBody} action={emptyAction} />
        </div>
      </div>
    );
  }

  // ── View toggle ────────────────────────────
  const viewToggle = (
    <SegmentedControl
      segments={[
        { id: "grid", label: resolved.viewModeGridLabel },
        { id: "list", label: resolved.viewModeListLabel },
      ]}
      value={activeViewMode}
      onChange={(id) => handleViewModeChange(id as TapeChartViewMode)}
      size="sm"
      aria-label={resolved.viewModeToggleLabel}
    />
  );

  // ── Render branch ──────────────────────────
  const isMobile = device.viewport === "mobile";

  const renderMainView = () => {
    if (activeViewMode === "list") {
      return (
        <TapeChartListView
          reservations={reservations}
          rooms={rooms}
          startDate={startDate}
          endDate={endDate}
          todayISO={todayISO}
          formatters={formatters}
          strings={resolved}
          selectedReservationId={selectedReservationId ?? null}
          onReservationSelect={handleReservationSelect}
        />
      );
    }
    if (isMobile) {
      return (
        <TapeChartMobileStack
          reservations={reservations}
          rooms={rooms}
          startDate={startDate}
          endDate={endDate}
          todayISO={todayISO}
          formatters={formatters}
          strings={resolved}
          selectedReservationId={selectedReservationId ?? null}
          onReservationSelect={handleReservationSelect}
        />
      );
    }
    return (
      <TapeChartGrid
        rooms={rooms}
        layout={layout}
        startDate={startDate}
        dayWidth={dayWidth}
        todayISO={todayISO}
        formatters={formatters}
        strings={resolved}
        focusedReservationId={focusedReservationId ?? selectedReservationId ?? null}
        selectedReservationId={selectedReservationId ?? null}
        onReservationSelect={handleReservationSelect}
      />
    );
  };

  return (
    <div
      ref={setRefs}
      className={`${styles.root}${className ? " " + className : ""}`}
      style={rootStyle}
      data-density={density}
      role="region"
      aria-label={resolved.regionLabel}
    >
      <TapeChartStatPills
        layout={layout}
        todayISO={todayISO}
        startDate={startDate}
        roomCount={rooms.length}
        formatters={formatters}
        strings={resolved}
      />
      {loading && reservations.length > 0 && (
        <Banner variant="info">
          <span>{resolved.loadingLabel}…</span>
        </Banner>
      )}
      <div className={styles.toolbar}>
        <div>{toolbarSlot}</div>
        <div className={styles.toolbarEnd}>{viewToggle}</div>
      </div>
      {renderMainView()}
    </div>
  );
});

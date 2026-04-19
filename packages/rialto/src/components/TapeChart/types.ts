import { type ReactNode } from "react";

export type TapeChartStatus =
  | "tentative"
  | "confirmed"
  | "checkedIn"
  | "checkedOut"
  | "cancelled"
  | "noShow";

export type TapeChartRoomStatus = "ready" | "dirty" | "outOfOrder" | "occupied";

export type TapeChartDensity = "compact" | "comfortable";

export type TapeChartViewMode = "grid" | "list";

export interface TapeChartReservation {
  id: string;
  roomId: string;
  /** ISO date (YYYY-MM-DD), inclusive — the check-in day. */
  start: string;
  /** ISO date (YYYY-MM-DD), EXCLUSIVE — the check-out day (hotel convention). */
  end: string;
  status: TapeChartStatus;
  guestName?: string;
  partySize?: number;
  /** Minor units (e.g. cents). */
  ratePerNight?: number;
  /** ISO 4217 currency code. */
  currency?: string;
  notes?: string;
  /** When the reservation represents a block (maintenance, OOO), this is the reason. */
  blockedReason?: string;
  /** Free-form booking source label (e.g. "Direct", "Booking.com"). */
  source?: string;
}

export interface TapeChartRoom {
  id: string;
  name: string;
  /** Used for grouping and secondary sort. */
  category?: string;
  capacity?: number;
  status?: TapeChartRoomStatus;
}

export interface TapeChartFormattedParts {
  startLong: string;
  endLong: string;
  nights: number;
  priceTotal?: string;
  partySize?: string;
  statusLabel: string;
  roomName: string;
}

export interface TapeChartStrings {
  regionLabel?: string;
  roomsColumnLabel?: string;
  arrivalsLabel?: string;
  departuresLabel?: string;
  inHouseLabel?: string;
  viewModeToggleLabel?: string;
  viewModeGridLabel?: string;
  viewModeListLabel?: string;
  todayLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  errorTitle?: string;
  errorRetryLabel?: string;
  loadingLabel?: string;
  moveDialogTitle?: string;
  moveConfirmLabel?: string;
  moveCancelLabel?: string;
  conflictWarning?: string;
  statusLabels?: Partial<Record<TapeChartStatus, string>>;
  roomStatusLabels?: Partial<Record<TapeChartRoomStatus, string>>;
  reservationAriaTemplate?: (r: TapeChartReservation, fmt: TapeChartFormattedParts) => string;
  nightsLabel?: (count: number) => string;
  partySizeLabel?: (count: number) => string;
}

export interface TapeChartMovePayload {
  id: string;
  toRoomId: string;
  /** New inclusive check-in date. */
  newStart: string;
  /** New exclusive check-out date. */
  newEnd: string;
}

export interface TapeChartProps {
  reservations: TapeChartReservation[];
  rooms: TapeChartRoom[];
  /** ISO date (inclusive). */
  startDate: string;
  /** ISO date (exclusive). */
  endDate: string;
  locale?: string;
  /** IANA time zone (e.g. "America/Los_Angeles"). Defaults to the runtime zone. */
  timeZone?: string;
  /** ISO 4217 code used for rate display when reservations don't carry their own. */
  currency?: string;
  density?: TapeChartDensity;
  /** Override the default day-column width in pixels. */
  dayWidth?: number;
  viewMode?: TapeChartViewMode;
  defaultViewMode?: TapeChartViewMode;
  onViewModeChange?: (mode: TapeChartViewMode) => void;
  onReservationClick?: (r: TapeChartReservation) => void;
  onReservationMove?: (payload: TapeChartMovePayload) => void | Promise<void>;
  checkConflict?: (payload: TapeChartMovePayload) => Promise<boolean | string>;
  selectedReservationId?: string | null;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  strings?: TapeChartStrings;
  /** Row count above which virtualization engages. Default 50. */
  virtualizeThreshold?: number;
  className?: string;
  /** Slot rendered above the grid (e.g. filter bar). */
  toolbarSlot?: ReactNode;
  /** Slot rendered inside the empty state. */
  emptyAction?: ReactNode;
}

/** Positioned bar result from useTapeChartLayout. */
export interface TapeChartPositionedBar {
  reservation: TapeChartReservation;
  /** Offset in days from startDate (non-negative after clipping). */
  startOffset: number;
  /** Span in days (always >= 1 after clipping). */
  span: number;
  /** Lane within the row, 0-indexed. Overlapping reservations get separate lanes. */
  lane: number;
  /** Whether the reservation extends past the visible range on either end. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export interface TapeChartLayout {
  /** Map roomId → list of positioned bars, ordered by startOffset then lane. */
  barsByRoom: Map<string, TapeChartPositionedBar[]>;
  /** Total visible days (endDate - startDate). */
  dayCount: number;
  /** Highest lane count across all rooms; drives row height. */
  maxLanes: number;
  /** Per-day counts for the stat pills: arrivals, departures, in-house (as of that date). */
  dailyCounts: Array<{ date: string; arrivals: number; departures: number; inHouse: number }>;
}

import type {
  TapeChartFormattedParts,
  TapeChartReservation,
  TapeChartStatus,
  TapeChartRoomStatus,
  TapeChartStrings,
} from "./types";

const STATUS_LABELS_EN: Record<TapeChartStatus, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
  checkedIn: "Checked in",
  checkedOut: "Checked out",
  cancelled: "Cancelled",
  noShow: "No-show",
};

const ROOM_STATUS_LABELS_EN: Record<TapeChartRoomStatus, string> = {
  ready: "Ready",
  dirty: "Dirty",
  outOfOrder: "Out of order",
  occupied: "Occupied",
};

const defaultNightsLabel = (count: number) => (count === 1 ? `${count} night` : `${count} nights`);

const defaultPartySizeLabel = (count: number) =>
  count === 1 ? `${count} guest` : `${count} guests`;

const defaultReservationAriaTemplate = (
  r: TapeChartReservation,
  fmt: TapeChartFormattedParts
): string => {
  const pieces = [
    r.guestName ?? "Reservation",
    `${fmt.roomName}`,
    `${fmt.startLong} to ${fmt.endLong}`,
    `${defaultNightsLabel(fmt.nights)}`,
  ];
  if (fmt.partySize) pieces.push(fmt.partySize);
  pieces.push(fmt.statusLabel);
  if (r.source) pieces.push(`via ${r.source}`);
  if (fmt.priceTotal) pieces.push(fmt.priceTotal);
  if (r.blockedReason) pieces.push(`reason: ${r.blockedReason}`);
  return pieces.join(", ");
};

export type ResolvedStrings = Required<
  Omit<
    TapeChartStrings,
    | "reservationAriaTemplate"
    | "nightsLabel"
    | "partySizeLabel"
    | "statusLabels"
    | "roomStatusLabels"
  >
> & {
  reservationAriaTemplate: (r: TapeChartReservation, fmt: TapeChartFormattedParts) => string;
  nightsLabel: (count: number) => string;
  partySizeLabel: (count: number) => string;
  statusLabels: Record<TapeChartStatus, string>;
  roomStatusLabels: Record<TapeChartRoomStatus, string>;
};

export const DEFAULT_STRINGS: ResolvedStrings = {
  regionLabel: "Reservations tape chart",
  roomsColumnLabel: "Rooms",
  arrivalsLabel: "Arrivals",
  departuresLabel: "Departures",
  inHouseLabel: "In-house",
  viewModeToggleLabel: "View mode",
  viewModeGridLabel: "Grid",
  viewModeListLabel: "List",
  todayLabel: "Today",
  emptyTitle: "No rooms configured",
  emptyBody: "Add a room to start managing reservations.",
  errorTitle: "Couldn't load reservations",
  errorRetryLabel: "Try again",
  loadingLabel: "Loading reservations",
  moveDialogTitle: "Move reservation",
  moveConfirmLabel: "Move",
  moveCancelLabel: "Cancel",
  conflictWarning: "This move conflicts with another reservation.",
  statusLabels: STATUS_LABELS_EN,
  roomStatusLabels: ROOM_STATUS_LABELS_EN,
  reservationAriaTemplate: defaultReservationAriaTemplate,
  nightsLabel: defaultNightsLabel,
  partySizeLabel: defaultPartySizeLabel,
};

export function mergeStrings(overrides?: TapeChartStrings): ResolvedStrings {
  if (!overrides) return DEFAULT_STRINGS;
  return {
    ...DEFAULT_STRINGS,
    ...overrides,
    statusLabels: { ...DEFAULT_STRINGS.statusLabels, ...overrides.statusLabels },
    roomStatusLabels: { ...DEFAULT_STRINGS.roomStatusLabels, ...overrides.roomStatusLabels },
    reservationAriaTemplate:
      overrides.reservationAriaTemplate ?? DEFAULT_STRINGS.reservationAriaTemplate,
    nightsLabel: overrides.nightsLabel ?? DEFAULT_STRINGS.nightsLabel,
    partySizeLabel: overrides.partySizeLabel ?? DEFAULT_STRINGS.partySizeLabel,
  };
}

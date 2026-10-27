import { enUS, type RialtoMessages } from "../../i18n/messages";
import type {
  TapeChartFormattedParts,
  TapeChartOverlapKind,
  TapeChartReservation,
  TapeChartStatus,
  TapeChartRoomStatus,
  TapeChartStrings,
} from "./types";

function ariaTemplateFor(messages: RialtoMessages) {
  const t = messages.tapeChart;
  return (r: TapeChartReservation, fmt: TapeChartFormattedParts): string => {
    const pieces = [
      r.guestName ?? messages.reservation,
      `${fmt.roomName}`,
      messages.dateSpan(fmt.startLong, fmt.endLong),
      t.nightsLabel(fmt.nights),
    ];
    if (fmt.partySize) pieces.push(fmt.partySize);
    pieces.push(fmt.statusLabel);
    if (fmt.overlapLabel) pieces.push(fmt.overlapLabel);
    if (r.source) pieces.push(t.viaSource(r.source));
    if (fmt.priceTotal) pieces.push(fmt.priceTotal);
    if (r.blockedReason) pieces.push(t.blockedReason(r.blockedReason));
    return pieces.join(", ");
  };
}

export type ResolvedStrings = Required<
  Omit<
    TapeChartStrings,
    | "reservationAriaTemplate"
    | "nightsLabel"
    | "partySizeLabel"
    | "statusLabels"
    | "roomStatusLabels"
    | "overlapLabels"
  >
> & {
  reservationAriaTemplate: (r: TapeChartReservation, fmt: TapeChartFormattedParts) => string;
  nightsLabel: (count: number) => string;
  partySizeLabel: (count: number) => string;
  statusLabels: Record<TapeChartStatus, string>;
  roomStatusLabels: Record<TapeChartRoomStatus, string>;
  overlapLabels: Record<TapeChartOverlapKind, string>;
};

/** The built-in labels for one locale's messages (ADR-028). */
function defaultStringsFor(messages: RialtoMessages): ResolvedStrings {
  const { viaSource: _via, blockedReason: _reason, ...labels } = messages.tapeChart;
  return {
    ...labels,
    errorRetryLabel: messages.tryAgain,
    moveCancelLabel: messages.cancel,
    reservationAriaTemplate: ariaTemplateFor(messages),
  };
}

/** en-US defaults, for callers outside a render (and as the no-provider value). */
export const DEFAULT_STRINGS: ResolvedStrings = defaultStringsFor(enUS);

export function mergeStrings(
  overrides?: TapeChartStrings,
  messages: RialtoMessages = enUS
): ResolvedStrings {
  const defaults = messages === enUS ? DEFAULT_STRINGS : defaultStringsFor(messages);
  if (!overrides) return defaults;
  return {
    ...defaults,
    ...overrides,
    statusLabels: { ...defaults.statusLabels, ...overrides.statusLabels },
    roomStatusLabels: { ...defaults.roomStatusLabels, ...overrides.roomStatusLabels },
    overlapLabels: { ...defaults.overlapLabels, ...overrides.overlapLabels },
    reservationAriaTemplate: overrides.reservationAriaTemplate ?? defaults.reservationAriaTemplate,
    nightsLabel: overrides.nightsLabel ?? defaults.nightsLabel,
    partySizeLabel: overrides.partySizeLabel ?? defaults.partySizeLabel,
  };
}

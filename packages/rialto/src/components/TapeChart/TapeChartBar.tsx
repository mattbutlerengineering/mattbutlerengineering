import { forwardRef, type KeyboardEvent, type CSSProperties } from "react";
import styles from "./TapeChart.module.css";
import type {
  TapeChartFormattedParts,
  TapeChartPositionedBar,
  TapeChartReservation,
} from "./types";
import type { TapeChartFormatters } from "./useTapeChartI18n";
import { DEFAULT_STRINGS, type ResolvedStrings } from "./defaultStrings";

export interface TapeChartBarProps {
  bar: TapeChartPositionedBar;
  roomName: string;
  formatters: TapeChartFormatters;
  strings: ResolvedStrings;
  selected?: boolean;
  tabIndex: number;
  onSelect: (r: TapeChartReservation) => void;
}

function buildFormattedParts(
  bar: TapeChartPositionedBar,
  roomName: string,
  formatters: TapeChartFormatters,
  strings: ResolvedStrings
): TapeChartFormattedParts {
  const r = bar.reservation;
  const nights = bar.span;
  const priceTotal =
    r.ratePerNight != null ? formatters.currency(r.ratePerNight * nights, r.currency) : undefined;
  const partySize = r.partySize != null ? strings.partySizeLabel(r.partySize) : undefined;
  const statusLabel = strings.statusLabels[r.status] ?? DEFAULT_STRINGS.statusLabels[r.status];
  const overlapLabel = bar.overlap ? strings.overlapLabels[bar.overlap] : undefined;
  return {
    startLong: formatters.dayLong(r.start),
    endLong: formatters.dayLong(r.end),
    nights,
    priceTotal,
    partySize,
    statusLabel,
    roomName,
    overlapLabel,
  };
}

/** Hand-rolled warning glyph (triangle, bar, dot) — same idiom as Banner's variant icons; no lucide. */
const conflictGlyph = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={styles.overlapGlyph}
  >
    <path d="M8 2L1.5 13h13L8 2z" />
    <path d="M8 6.5v3" />
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
  </svg>
);

export const TapeChartBar = forwardRef<HTMLButtonElement, TapeChartBarProps>(
  function TapeChartBar(props, ref) {
    const { bar, roomName, formatters, strings, selected, tabIndex, onSelect } = props;
    const r = bar.reservation;

    const style: CSSProperties = {
      ["--tapechart-bar-start" as string]: bar.startOffset,
      ["--tapechart-bar-span" as string]: bar.span,
      ["--tapechart-bar-lane" as string]: bar.lane,
    };

    const parts = buildFormattedParts(bar, roomName, formatters, strings);
    const ariaLabel = strings.reservationAriaTemplate(r, parts);

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(r);
      }
    };

    const title = r.guestName ?? r.blockedReason ?? parts.statusLabel;
    const priceShort =
      r.ratePerNight != null
        ? formatters.currency(r.ratePerNight * bar.span, r.currency)
        : undefined;

    return (
      <button
        ref={ref}
        type="button"
        className={styles.bar}
        style={style}
        data-status={r.status}
        data-blocked={r.blockedReason ? "true" : undefined}
        data-selected={selected ? "true" : undefined}
        data-lane={bar.lane}
        data-overlap={bar.overlap}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        aria-pressed={selected ?? false}
        onClick={() => onSelect(r)}
        onKeyDown={handleKeyDown}
      >
        {bar.overlap === "conflict" && conflictGlyph}
        <span className={styles.barTitle}>{title}</span>
        {priceShort && <span className={styles.barMeta}>{priceShort}</span>}
      </button>
    );
  }
);

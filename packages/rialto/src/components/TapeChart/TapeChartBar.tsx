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
  strings: ResolvedStrings,
): TapeChartFormattedParts {
  const r = bar.reservation;
  const nights = bar.span;
  const priceTotal =
    r.ratePerNight != null
      ? formatters.currency(r.ratePerNight * nights, r.currency)
      : undefined;
  const partySize =
    r.partySize != null ? strings.partySizeLabel(r.partySize) : undefined;
  const statusLabel =
    strings.statusLabels[r.status] ?? DEFAULT_STRINGS.statusLabels[r.status];
  return {
    startLong: formatters.dayLong(r.start),
    endLong: formatters.dayLong(r.end),
    nights,
    priceTotal,
    partySize,
    statusLabel,
    roomName,
  };
}

export const TapeChartBar = forwardRef<HTMLButtonElement, TapeChartBarProps>(
  function TapeChartBar(props, ref) {
    const { bar, roomName, formatters, strings, selected, tabIndex, onSelect } = props;
    const r = bar.reservation;

    const style: CSSProperties = {
      ["--tapechart-bar-start" as string]: bar.startOffset,
      ["--tapechart-bar-span" as string]: bar.span,
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
    const priceShort = r.ratePerNight != null
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
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(r)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.barTitle}>{title}</span>
        {priceShort && <span className={styles.barMeta}>{priceShort}</span>}
      </button>
    );
  },
);

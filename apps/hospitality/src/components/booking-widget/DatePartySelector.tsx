import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Calendar, Input, Button } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays, venueDate } from "../../utils/service-day.js";
import styles from "./DatePartySelector.module.css";

export interface DatePartySelectorProps {
  selectedDate: string | null;
  selectedEndDate?: string | null;
  partySize: number;
  onDateChange: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  onPartySizeChange: (size: number) => void;
  onNext: () => void;
  minDate?: string;
  maxDate?: string;
  maxPartySize?: number;
  enableDateRange?: boolean;
  /** Venue contact phone, shown as a tel: link for parties above maxPartySize (#4979). */
  phone?: string;
  /**
   * IANA timezone the venue operates in — used to compute "today" on the
   * venue's clock rather than a UTC midnight boundary (#4981). Omit only
   * when unknown; falls back to the device clock.
   */
  venueTimezone?: string;
  /**
   * Dates the venue is closed, date to the guest message. Shown disabled in
   * the calendar with the reason as their accessible name (ux.md F9.1).
   */
  closedDates?: Readonly<Record<string, string>>;
}

/** Upper bound on how many numbered buttons the grid ever renders (#4979) — a
 * venue's real maxPartySize can be arbitrarily large; beyond this the
 * overflow option is the only way to indicate a bigger party. */
const MAX_RENDERED_PARTY_SIZE_BUTTONS = 20;

export function DatePartySelector({
  selectedDate,
  selectedEndDate,
  partySize,
  onDateChange,
  onEndDateChange,
  onPartySizeChange,
  onNext,
  minDate,
  maxDate,
  maxPartySize = 8,
  enableDateRange = false,
  phone,
  venueTimezone,
  closedDates = {},
}: DatePartySelectorProps) {
  const { t } = useTranslation();
  const format = useVenueFormat({ ianaTimezone: venueTimezone ?? "", currencyCode: "USD" });
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const focusedClosure = focusedDate ? closedDates[focusedDate] : undefined;
  const today = venueDate(new Date(), venueTimezone);
  const effectiveMinDate = minDate ?? today;

  const effectiveMaxDate = maxDate ?? addDays(today, 30);

  const renderedMaxPartySize = Math.min(maxPartySize, MAX_RENDERED_PARTY_SIZE_BUTTONS);
  const partySizes = Array.from({ length: renderedMaxPartySize }, (_, i) => i + 1);
  const isOverflowSelected = partySize > maxPartySize;

  // #4981: the date input's `min` attribute only guides the native picker —
  // a typed (or pasted) past date is still accepted, so canProceed must
  // reject it explicitly rather than trusting the browser.
  const isDateBeforeMin = selectedDate !== null && selectedDate < effectiveMinDate;
  const canProceed =
    selectedDate !== null && !isDateBeforeMin && partySize > 0 && !isOverflowSelected;

  return (
    <div className={styles.container}>
      {enableDateRange ? (
        <>
          <Input
            label={t("bookingWidget.dateParty.startDate")}
            type="date"
            value={selectedDate ?? ""}
            onChange={(e) => onDateChange(e.target.value)}
            min={effectiveMinDate}
            max={effectiveMaxDate}
          />
          {onEndDateChange && (
            <Input
              label={t("bookingWidget.dateParty.endDate")}
              type="date"
              value={selectedEndDate ?? ""}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={selectedDate ?? effectiveMinDate}
              max={effectiveMaxDate}
            />
          )}
        </>
      ) : (
        <div className={styles.field}>
          <span className={styles.label}>{t("bookingWidget.dateParty.date")}</span>
          <Calendar
            value={selectedDate}
            onChange={(value) => value && onDateChange(value)}
            isDateDisabled={(iso) =>
              iso < effectiveMinDate || iso > effectiveMaxDate || iso in closedDates
            }
            getDateLabel={(iso) =>
              iso in closedDates
                ? t("bookingWidget.dateParty.dateClosedLabel", {
                    date: format.formatLongDate(iso),
                    message: closedDates[iso],
                  })
                : format.formatLongDate(iso)
            }
            onFocus={(e) => setFocusedDate(e.target.getAttribute("data-date"))}
            onBlur={(e) => {
              // Focus moving to another day keeps the note; the next onFocus replaces it.
              if (!e.currentTarget.contains(e.relatedTarget)) setFocusedDate(null);
            }}
          />
          <p role="status" className={styles.closureNote}>
            {focusedClosure}
          </p>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label} id="party-size-label">
          {t("bookingWidget.dateParty.partySize")}
        </span>
        <div className={styles.partyGrid} role="group" aria-labelledby="party-size-label">
          {partySizes.map((size) => (
            <Button
              key={size}
              type="button"
              aria-pressed={partySize === size}
              onClick={() => onPartySizeChange(size)}
              className={[
                styles.partyButton,
                partySize === size ? styles.partyButtonActive : "",
              ].join(" ")}
            >
              {size}
            </Button>
          ))}
          <Button
            type="button"
            aria-pressed={isOverflowSelected}
            onClick={() => onPartySizeChange(maxPartySize + 1)}
            className={[
              styles.partyButton,
              isOverflowSelected ? styles.partyButtonActive : "",
            ].join(" ")}
          >
            {maxPartySize}+
          </Button>
        </div>
        {isOverflowSelected && (
          <p className={styles.partySizeNote}>
            {phone ? (
              <Trans
                i18nKey="bookingWidget.dateParty.largePartyCall"
                values={{ max: maxPartySize, phone }}
                components={{
                  // Trans fills the link with the catalog's <phoneLink> content.
                  phoneLink: (
                    <a className={styles.partySizeNoteLink} href={`tel:${phone}`}>
                      {phone}
                    </a>
                  ),
                }}
              />
            ) : (
              t("bookingWidget.dateParty.largePartyContact", { max: maxPartySize })
            )}
          </p>
        )}
      </div>

      <Button
        variant="primary"
        onClick={onNext}
        disabled={!canProceed}
        className={styles.ctaButton}
      >
        {t("bookingWidget.dateParty.findTimes")}
      </Button>
      {!canProceed && !isOverflowSelected && (
        <p className={styles.ctaHint}>{t("bookingWidget.dateParty.dateHint")}</p>
      )}
    </div>
  );
}

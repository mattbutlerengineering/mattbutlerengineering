import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { Seating } from "@mbe/types";
import { useVenueFormat } from "../../../hooks/useVenueFormat.js";
import { clockHour } from "../../../utils/clock-hour.js";
import { ServiceOptions } from "./ServiceOptions.js";
import type { BookingTypes } from "./service-options.js";
import { autoLastSeating, type LinkedTimes } from "./service-times.js";
import { TimesRow, type TimeProblems } from "./TimesRow.js";

/** A service's fields as plain values: clock strings, and seating and booking as they are stored. */
export interface ServiceFieldsValue extends LinkedTimes {
  /** An interval ("Seat every"), or fixed seating times, which are shown and never changed. */
  readonly seating: Seating;
  readonly bookingTypes: BookingTypes;
}

export interface ServiceFieldsProps {
  readonly value: ServiceFieldsValue;
  /** The next values. What a change did not touch is handed back as the same object. */
  readonly onChange: (next: ServiceFieldsValue) => void;
  /** Prefix of the field ids (`serviceFieldId`); unique per service on the page. */
  readonly idScope: string;
  /** The problems with the three times. This component validates nothing. */
  readonly problems?: TimeProblems;
  /** The one date these hours are for: the overnight hint then names the weekday it closes on. */
  readonly date?: string;
  /**
   * "Seat every" and "Booked by": in the row (default), behind "More options", or left out where
   * the form cannot save them.
   */
  readonly options?: "shown" | "collapsed" | "hidden";
  /** The form's own controls for the service, placed between the times and the options. */
  readonly children?: ReactNode;
}

/** The last seating a linked service follows, said under the times. */
function LastSeatingHint({ value }: { readonly value: LinkedTimes }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  if (!value.lastSeatingLinked || value.closes === null) return null;
  const followed = autoLastSeating(value.closes, value.opens);
  return (
    <Text variant="caption" color="secondary">
      {t("availability.quickSetup.lastSeatingHint", {
        time: format.formatLocalTime(followed),
        count: clockHour(Number.parseInt(followed, 10) * 60),
      })}
    </Text>
  );
}

/** "More options": a disclosure, closed until pressed. */
function MoreOptions({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen(!open)}
        >
          {t("availabilityHub.serviceFields.moreOptions")}
        </Button>
      </div>
      {/* Mounted only while open, so a closed disclosure adds no row to the form's stack. */}
      {open && <div id={id}>{children}</div>}
    </>
  );
}

/**
 * The one set of fields for a service's hours: opens, last seating, closes, their hints, "Seat
 * every" and "Booked by". Presentation only: it holds plain values, saves nothing and knows
 * neither the weekly form's draft nor the date editor's.
 */
export function ServiceFields({
  value,
  onChange,
  idScope,
  problems,
  date,
  options = "shown",
  children,
}: ServiceFieldsProps) {
  const fields = (
    <ServiceOptions
      seating={value.seating}
      bookingTypes={value.bookingTypes}
      onSeatingChange={(seating) => onChange({ ...value, seating })}
      onBookingTypesChange={(bookingTypes) => onChange({ ...value, bookingTypes })}
      idScope={idScope}
    />
  );
  return (
    <>
      <TimesRow
        times={value}
        onChange={onChange}
        idScope={idScope}
        problems={problems}
        date={date}
      />
      <LastSeatingHint value={value} />
      {children}
      {options === "shown" && fields}
      {options === "collapsed" && <MoreOptions id={`${idScope}-options`}>{fields}</MoreOptions>}
    </>
  );
}

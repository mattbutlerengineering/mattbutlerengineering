import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toPublicVenueProfile } from "@mbe/types";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { holidayCountry, holidaysIn, type HolidayCountry } from "./holidays.js";

/** The selected venue's holiday calendar: its profile address's country, else its language's. */
export function useHolidayCountry(): HolidayCountry | null {
  const format = useVenueFormat();
  const venue = useOptionalVenue()?.selectedVenue;
  return holidayCountry(
    toPublicVenueProfile(venue?.settings?.["profile"]).address?.country,
    format.locale
  );
}

/** The holidays among `dates`, by date, in the viewer's language ("Thanksgiving"). */
export function useHolidayNames(dates: readonly string[]): ReadonlyMap<string, string> {
  const country = useHolidayCountry();
  const { t } = useTranslation();
  return useMemo(() => {
    if (!country || dates.length === 0) return new Map();
    const shown = new Set(dates);
    const years = [...new Set(dates.map((d) => Number(d.slice(0, 4))))];
    return new Map(
      years
        .flatMap((year) => holidaysIn(country, year))
        .filter((h) => shown.has(h.date))
        .map((h) => [h.date, t(`availabilitySpecial.holidays.name.${h.id}`)])
    );
  }, [country, dates, t]);
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOptionalVenue } from "../../contexts/venue-context-object.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { holidayCountry, holidaysIn, type HolidayCountry } from "./holidays.js";

/**
 * `settings.profile.address.country` when it is a string. Read by hand, not through the profile's
 * Zod schema, so the Close dialog chunk that names holidays does not carry the schema.
 */
function addressCountry(profile: unknown): string | undefined {
  if (typeof profile !== "object" || profile === null) return undefined;
  const address = (profile as { address?: unknown }).address;
  if (typeof address !== "object" || address === null) return undefined;
  const country = (address as { country?: unknown }).country;
  return typeof country === "string" ? country : undefined;
}

/** The selected venue's holiday calendar: its profile address's country, else its language's. */
export function useHolidayCountry(): HolidayCountry | null {
  const format = useVenueFormat();
  const venue = useOptionalVenue()?.selectedVenue;
  return holidayCountry(addressCountry(venue?.settings?.["profile"]), format.locale);
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

/** Holidays a Manager said the venue keeps its usual hours on, per venue, on this browser. */
const storageKey = (venueId: string) => `mbe-availability-open-as-usual:${venueId}`;

export function readOpenAsUsual(venueId: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(venueId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    // Storage blocked or garbled: every holiday is offered again, which is harmless.
    return [];
  }
}

export function writeOpenAsUsual(venueId: string, dates: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey(venueId), JSON.stringify(dates));
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

import { afterAll, describe, expect, it } from "vitest";
import { localeRuntime } from "../i18n/runtime.js";
import esMX from "../i18n/catalogs/es-MX.json";
import frCA from "../i18n/catalogs/fr-CA.json";
import { formatLocalTime } from "./format.js";
import type { VenueFormat } from "../hooks/useVenueFormat.js";
import { clockHour, clockHourOfInstant } from "./clock-hour.js";

/**
 * Spanish says "a la 1:00" for one o'clock and "a las 2:00" for every other hour. The catalog
 * picks the article through a plural on the 12-hour-clock hour, never by joining strings.
 */

/** Every sentence that puts a time after "a", "desde" or "à". */
const SENTENCES = [
  ["availability.drawer.layer.closesAt", "a"],
  ["availability.drawer.removal.opensAt", "a"],
  ["availability.drawer.removal.closesLater", "a"],
  ["availability.drawer.removal.closesEarlier", "a"],
  ["availability.drawer.removal.lastSeating", "a"],
  ["availability.quickSetup.lastSeatingHint", "a"],
  ["availability.editor.overnight", "a"],
  ["availability.editor.overnightNextDay", "a"],
  ["availability.editor.conflict.theirs", "a"],
  ["availability.paused.waiting", "desde"],
  ["availability.paused.waitingNoneToday", "desde"],
  ["availability.tonight.toast.closed", "a"],
  ["availability.close.moveUnavailableBooking", "a"],
  ["availability.close.step2.movesTo", "a"],
  ["availability.close.step2.previewFor", "a"],
  ["home.openSign.open", "hasta"],
  ["home.openSign.openingSoon", "a"],
  ["home.openSign.closedToday", "a"],
  ["home.openSign.closedOn", "a"],
  ["timeline.block.title", "a"],
  ["onMyWayBadge.aria", "a"],
  ["onMyWayBadge.ariaPast", "a"],
  ["manageReservation.venueCancelled.rebook", "a"],
] as const;

async function textOf(tag: "es-MX" | "fr-CA", catalog: unknown, key: string, minute: number) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
  const time = formatLocalTime(
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
    tag
  );
  const t = localeRuntime.i18n.t as unknown as (key: string, values: object) => string;
  const text = t.call(localeRuntime.i18n, key, {
    time,
    count: clockHour(minute),
    name: "Cena",
    weekday: "lunes",
    summary: "Cambio",
    date: "lun, 5 oct",
    guest: "Ana",
    party: "2 personas",
  });
  return { text, time };
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("clockHour", () => {
  it("is the hour on a 12-hour clock, wrapping past midnight", () => {
    expect([0, 60, 120, 720, 780, 1380, 1440, 1500, 1560].map(clockHour)).toEqual([
      12, 1, 2, 12, 1, 11, 12, 1, 2,
    ]);
  });

  it("reads an instant's hour on the venue clock, whatever zone the machine is in", () => {
    const format = {
      formatInstant: (value: string, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("es-MX", { ...options, timeZone: "America/Los_Angeles" }).format(
          new Date(value)
        ),
    } as unknown as VenueFormat;
    // 09:15Z is 1:15 AM in Los Angeles (PST, UTC-8), 22:00Z is 2:00 PM.
    expect(clockHourOfInstant("2026-12-01T09:15:00.000Z", format)).toBe(1);
    expect(clockHourOfInstant("2026-12-01T22:00:00.000Z", format)).toBe(2);
  });
});

describe("es-MX picks 'la' or 'las' for every hour", () => {
  for (const [key, word] of SENTENCES) {
    it(`${key}`, async () => {
      for (let minute = 0; minute < 1440; minute += 30) {
        const { text, time } = await textOf("es-MX", esMX, key, minute);
        const oneOClock = clockHour(minute) === 1;
        const expected = new RegExp(`\\b${word} ${oneOClock ? "la" : "las"} ${escape(time)}`);
        expect(text, `${key} at ${time}`).toMatch(expected);
      }
    });
  }
});

describe("fr-CA keeps one preposition for every hour", () => {
  for (const [key] of SENTENCES) {
    it(`${key}`, async () => {
      const seen = new Set<string>();
      for (let minute = 0; minute < 1440; minute += 60) {
        const { text, time } = await textOf("fr-CA", frCA, key, minute);
        expect(text).toContain(time);
        seen.add(text.replace(time, "T"));
      }
      expect(seen.size).toBe(1);
    });
  }
});

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatTime,
  formatTimeIn,
  formatLocalTime,
  formatCurrencyFromCents,
  formatCurrencyName,
  formatLongDate,
  formatShortDate,
  resolveTimeZone,
  resetTimeZoneReports,
} from "./format.js";

// Verbatim pre-localization implementations (forced hour12, hardcoded en-US).
const legacy = {
  time: (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  timeIn: (iso: string, timeZone: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }),
  local: (hhmm: string) => {
    const [h = 0, m = 0] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(1970, 0, 1, h, m)).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    });
  },
  money: (cents: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
      cents / 100
    ),
  longDate: (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
};

const ISOS = [
  "2024-03-15T00:00:00Z",
  "2024-03-15T07:05:00Z",
  "2024-03-15T12:00:00Z",
  "2024-03-15T18:30:00Z",
  "2024-03-15T23:59:00Z",
  "2024-07-04T01:15:00Z",
  "2024-11-03T09:30:00Z",
  "2025-01-01T00:00:00Z",
];
const ZONES = ["America/Los_Angeles", "America/New_York"];
const CENTS = [0, 5, 100, 4000, 123456, 99999999];
const HHMM = ["00:00", "09:30", "12:00", "17:00", "23:45"];
const DATES = ["2024-01-01", "2024-03-15", "2025-12-31"];

describe("en-US equivalence with the pre-localization formatters", () => {
  it("matches over 40+ date/time/money inputs across two venue timezones", () => {
    let compared = 0;
    for (const iso of ISOS) {
      expect(formatTime(iso)).toBe(legacy.time(iso));
      compared++;
      for (const zone of ZONES) {
        expect(formatTimeIn(iso, zone, "en-US")).toBe(legacy.timeIn(iso, zone));
        compared++;
      }
    }
    for (const c of CENTS) {
      expect(formatCurrencyFromCents(c, "usd", "en-US")).toBe(legacy.money(c, "usd"));
      compared++;
    }
    for (const t of HHMM) {
      expect(formatLocalTime(t, "en-US")).toBe(legacy.local(t));
      compared++;
    }
    for (const d of DATES) {
      expect(formatLongDate(d, "en-US")).toBe(legacy.longDate(d));
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(20);
  });
});

describe("en-GB on a USD / America/Los_Angeles venue", () => {
  it("renders US$40.00, 24h time and dd/mm/yyyy", () => {
    expect(formatCurrencyFromCents(4000, "USD", "en-GB")).toBe("US$40.00");
    expect(formatTimeIn("2024-03-15T21:30:00Z", "America/Los_Angeles", "en-GB")).toBe("14:30");
    expect(formatShortDate("2024-03-15", "en-GB")).toBe("15/03/2024");
  });
});

describe("invalid IANA zone", () => {
  beforeEach(() => resetTimeZoneReports());

  it("falls back to the device zone and reports once", () => {
    const report = vi.fn();
    expect(resolveTimeZone("Not/AZone", report)).toBeUndefined();
    expect(resolveTimeZone("Not/AZone", report)).toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("Not/AZone");
  });

  it("keeps a valid zone and does not report", () => {
    const report = vi.fn();
    expect(resolveTimeZone("America/Los_Angeles", report)).toBe("America/Los_Angeles");
    expect(report).not.toHaveBeenCalled();
  });

  it("formatTimeIn does not throw on a bad zone", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => formatTimeIn("2024-03-15T21:30:00Z", "Bad/Zone")).not.toThrow();
  });
});

describe("formatCurrencyName", () => {
  it("names a currency in the given locale", () => {
    expect(formatCurrencyName("USD", "en-US")).toBe("US Dollar");
    expect(formatCurrencyName("MXN", "es-MX")).toBe("peso mexicano");
    expect(formatCurrencyName("CAD", "fr-CA")).toBe("dollar canadien");
  });

  it("is case-insensitive and falls back to the code for an unknown one", () => {
    expect(formatCurrencyName("eur", "en-US")).toBe("Euro");
    expect(formatCurrencyName("ZZZ", "en-US")).toBe("ZZZ");
  });
});

import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTapeChartI18n } from "./useTapeChartI18n";

describe("useTapeChartI18n", () => {
  describe("currency", () => {
    it("falls back to defaultCurrency when no code is passed", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC", "EUR"));
      expect(result.current.currency(129000)).toBe("€1,290.00");
    });

    it("falls back to USD when neither code nor defaultCurrency is passed", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.currency(129000)).toBe("$1,290.00");
    });

    it("formats an explicit code, and a second distinct code in the same hook instance without cache collision", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.currency(129000, "USD")).toBe("$1,290.00");
      expect(result.current.currency(129000, "EUR")).toBe("€1,290.00");
      // re-request USD after EUR was cached — proves the per-code Map cache
      // keys correctly instead of returning the last-created formatter
      expect(result.current.currency(50000, "USD")).toBe("$500.00");
    });
  });

  describe("pluralCategory", () => {
    it("returns 'one' for a singular count", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.pluralCategory(1)).toBe("one");
    });

    it("returns 'other' for a plural count", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.pluralCategory(3)).toBe("other");
    });
  });

  describe("compare", () => {
    it("sorts room names numerically (numeric: true)", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      const names = ["Room 10", "Room 2", "Room 1"];
      expect([...names].sort(result.current.compare)).toEqual(["Room 1", "Room 2", "Room 10"]);
    });

    it("is case/diacritic-insensitive (sensitivity: base)", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.compare("cafe", "Café")).toBe(0);
      expect(result.current.compare("suite", "SUITE")).toBe(0);
    });
  });

  describe("todayISO", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-05T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns today's date as YYYY-MM-DD", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.todayISO()).toBe("2026-03-05");
    });
  });

  describe("dayLong / monthYearLong", () => {
    it("formats a known ISO date", () => {
      const { result } = renderHook(() => useTapeChartI18n("en-US", "UTC"));
      expect(result.current.dayLong("2022-10-28")).toBe("Friday, October 28, 2022");
      expect(result.current.monthYearLong("2022-10-28")).toBe("October 2022");
    });
  });

  describe("locale fallback", () => {
    // jsdom always defines `navigator`, so calling the hook with no `locale`
    // arg exercises the `typeof navigator !== "undefined"` branch and picks
    // up `navigator.language`. The `"en-US"` no-`navigator` branch is
    // untestable in jsdom and is left as documented dead code for this
    // environment rather than silently dropped from the hook.
    it("falls back to navigator.language when locale is not passed", () => {
      const { result } = renderHook(() => useTapeChartI18n());
      expect(result.current.locale).toBe(navigator.language);
    });
  });
});

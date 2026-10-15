import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { ReactNode } from "react";
import { useVenueFormat } from "./useVenueFormat.js";

const VENUE = { ianaTimezone: "America/Los_Angeles", currencyCode: "USD" } as const;

async function wrapperFor(language: string) {
  const instance = createInstance();
  await instance.use(initReactI18next).init({ lng: language, resources: {}, fallbackLng: false });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
  };
}

describe("useVenueFormat", () => {
  it("binds the active language to the venue's zone and currency (en-GB, USD venue)", async () => {
    const { result } = renderHook(() => useVenueFormat(VENUE), {
      wrapper: await wrapperFor("en-GB"),
    });
    expect(result.current.locale).toBe("en-GB");
    expect(result.current.formatMoney(4000)).toBe("US$40.00");
    expect(result.current.formatTime("2024-03-15T21:30:00Z")).toBe("14:30");
    expect(result.current.formatShortDate("2024-03-15")).toBe("15/03/2024");
  });

  it("renders en-US 12h time in the venue zone", async () => {
    const { result } = renderHook(() => useVenueFormat(VENUE), {
      wrapper: await wrapperFor("en-US"),
    });
    expect(result.current.formatTime("2024-03-15T21:30:00Z")).toBe("2:30 PM");
    expect(result.current.formatMoney(4000)).toBe("$40.00");
  });

  it("falls back to the device zone for an invalid venue zone without throwing", async () => {
    const { result } = renderHook(
      () => useVenueFormat({ ianaTimezone: "Bad/Zone", currencyCode: "USD" }),
      { wrapper: await wrapperFor("en-US") }
    );
    expect(() => result.current.formatTime("2024-03-15T21:30:00Z")).not.toThrow();
  });
});

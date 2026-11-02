import { afterAll, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { localeRuntime } from "../../i18n/runtime.js";
import esMX from "../../i18n/catalogs/es-MX.json";
import { useWinningChangeText } from "./use-winning-change-text.js";

vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));

/** `useVenueFormat` reads this context, so times are on the venue clock in any test zone. */
const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;
const wrapper = ({ children }: { children: ReactNode }) => (
  <VenueContext.Provider value={VENUE}>{children}</VenueContext.Provider>
);

const CHANGE: AvailabilityChangeSummary = {
  id: "chg-1",
  actorId: "auth0|ana",
  at: "2026-12-02T09:15:00.000Z", // 1:15 AM in Los Angeles
  kind: "tonight_end",
  summary: "Tonight change ended",
  detail: { code: "tonight_ended" },
};

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("useWinningChangeText loads the wording of a code on demand", () => {
  it("shows the stored English summary at first, then the viewer's language", async () => {
    localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
    await localeRuntime.i18n.changeLanguage("es-MX");
    const { result } = renderHook(() => useWinningChangeText(CHANGE), { wrapper });
    expect(result.current).toContain("Tonight change ended");
    await waitFor(() => expect(result.current).toContain("Se terminó el cambio de esta noche"));
    expect(result.current).not.toContain("Tonight change ended");
  });

  it("never loads it for a change with no code", async () => {
    await localeRuntime.i18n.changeLanguage("en-US");
    const { result } = renderHook(() => useWinningChangeText({ ...CHANGE, detail: undefined }), {
      wrapper,
    });
    expect(result.current).toContain("Tonight change ended");
  });

  it("says another change was saved when none is named", async () => {
    await localeRuntime.i18n.changeLanguage("en-US");
    const { result } = renderHook(() => useWinningChangeText(null), { wrapper });
    expect(result.current).toBe("Someone else changed availability first.");
  });
});

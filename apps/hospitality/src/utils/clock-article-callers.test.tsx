import { afterAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Reservation } from "@mbe/types";
import type { ManagedVenueCancellation } from "@mbe/api-client";
import { VenueContext, type VenueContextValue } from "../contexts/venue-context-object.js";
import { localeRuntime } from "../i18n/runtime.js";
import esMX from "../i18n/catalogs/es-MX.json";
import { ReservationBlock } from "../components/timeline/ReservationBlock.js";
import { VenueCancelledCard } from "../components/manage-reservation/VenueCancelledCard.js";
import { formatVenueOpenLabel } from "./venueOpenLabel.js";

/**
 * Outside availability, the callers of the es-MX "a la / a las" plurals must pass the hour as
 * `count`. The catalog walk in clock-article.test.ts pins the sentences; this pins the callers.
 */

const ZONE = "America/Los_Angeles";
const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: ZONE, currencyCode: "USD" },
} as VenueContextValue;

// 09:15Z is 1:15 AM in Los Angeles (PST) whatever zone the machine is in; 22:00Z is 2:00 PM.
const AT_ONE_FIFTEEN = "2026-12-01T09:15:00.000Z";
const AT_TWO = "2026-12-01T22:00:00.000Z";

async function useSpanish() {
  localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
  await localeRuntime.i18n.changeLanguage("es-MX");
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

function reservation(startTime: string): Reservation {
  return {
    id: "res-1",
    date: "2026-12-01",
    startTime,
    endTime: startTime,
    partySize: 2,
    status: "CONFIRMED",
    guestName: "Ana",
  } as Reservation;
}

describe("timeline block title", () => {
  it("says 'a la' at one o'clock and 'a las' at two on the venue's clock", async () => {
    await useSpanish();
    for (const [at, article] of [
      [AT_ONE_FIFTEEN, "a la 1:15"],
      [AT_TWO, "a las 2:00"],
    ] as const) {
      const { unmount } = render(
        <VenueContext.Provider value={VENUE}>
          <ReservationBlock reservation={reservation(at)} style={{ left: 0, width: 100 }} />
        </VenueContext.Provider>
      );
      expect(screen.getByRole("button").getAttribute("title")).toContain(article);
      unmount();
    }
  });
});

describe("manage rebook button", () => {
  it("says 'a la' at one o'clock and 'a las' at two on the venue's clock", async () => {
    await useSpanish();
    const format = {
      formatTime: (iso: string) =>
        new Intl.DateTimeFormat("es-MX", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: ZONE,
        }).format(new Date(iso)),
      formatCalendarDate: () => "lun",
      formatInstant: (value: string | number | Date, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat("es-MX", { ...options, timeZone: ZONE }).format(new Date(value)),
    };
    const cancellation: ManagedVenueCancellation = {
      refundStatus: "none",
      closureDate: "2026-12-01",
      closureMessage: null,
      offers: [
        { id: "a", date: "2026-12-01", startTime: AT_ONE_FIFTEEN },
        { id: "b", date: "2026-12-01", startTime: AT_TWO },
      ],
      rebooked: null,
    };
    render(
      <main>
        <VenueCancelledCard
          venue={{ name: "Oak", slug: "oak" }}
          token="t"
          cancellation={cancellation}
          format={format}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onRebooked={vi.fn()}
        />
      </main>
    );
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels.some((l) => /^Reservar lun a la 1:15/.test(l))).toBe(true);
    expect(labels.some((l) => /^Reservar lun a las 2:00/.test(l))).toBe(true);
  });
});

describe("home open-state label", () => {
  it("says 'hasta la' / 'a la' at one o'clock and 'las' at every other hour", async () => {
    await useSpanish();
    const t = localeRuntime.i18n.t.bind(localeRuntime.i18n);
    const clock = (hhmm: string) => hhmm;
    expect(formatVenueOpenLabel({ state: "open", closesAt: "01:00" }, clock, t)).toBe(
      "Abierto hasta la 01:00"
    );
    expect(formatVenueOpenLabel({ state: "open", closesAt: "13:00" }, clock, t)).toBe(
      "Abierto hasta la 13:00"
    );
    expect(formatVenueOpenLabel({ state: "open", closesAt: "22:00" }, clock, t)).toBe(
      "Abierto hasta las 22:00"
    );
    expect(formatVenueOpenLabel({ state: "opening-soon", opensAt: "17:00" }, clock, t)).toBe(
      "Abre a las 17:00"
    );
    expect(
      formatVenueOpenLabel({ state: "closed", opensAt: "01:30", opensOn: null }, clock, t)
    ).toBe("Cerrado, abre a la 01:30");
    expect(
      formatVenueOpenLabel({ state: "closed", opensAt: "14:00", opensOn: "monday" }, clock, t)
    ).toBe("Cerrado, abre el lunes a las 14:00");
  });
});

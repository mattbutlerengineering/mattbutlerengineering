import { describe, it, expect, beforeAll } from "vitest";
import type { Reservation } from "@mbe/types";
import { localeRuntime } from "../i18n/runtime.js";
import esMX from "../i18n/catalogs/es-MX.json";
import { liveReservationToast } from "./live-reservation-toast.js";

const at = () => "7:30 PM";
const r = (guestName: string | null) =>
  ({ guestName, startTime: "2026-10-15T19:30:00Z" }) as Reservation;

beforeAll(() => {
  localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
});

describe("liveReservationToast", () => {
  const en = () => localeRuntime.i18n.getFixedT("en-US");
  const es = () => localeRuntime.i18n.getFixedT("es-MX");

  it("keeps the en-US created toast", () => {
    expect(liveReservationToast("reservation:created", r("Alice"), en(), at)).toEqual({
      title: "New reservation",
      description: "Alice — 7:30 PM",
    });
  });

  it("renders a real apostrophe in the cancelled toast, not an HTML entity", () => {
    expect(liveReservationToast("reservation:cancelled", r("Alice"), en(), at)).toEqual({
      title: "Reservation cancelled",
      description: "Alice's reservation was cancelled",
    });
  });

  it("falls back to the localized guest word and translates in es-MX", () => {
    const toast = liveReservationToast("reservation:cancelled", r(null), es(), at);
    expect(toast.title).toBe("Reservación cancelada");
    expect(toast.description).toContain("Cliente");
  });
});

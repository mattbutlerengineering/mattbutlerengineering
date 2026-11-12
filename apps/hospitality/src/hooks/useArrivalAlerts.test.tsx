import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Reservation, SseEvent } from "@mbe/types";
import { useArrivalAlerts } from "./useArrivalAlerts.js";
import { setArrivalChimeMuted } from "../lib/arrival-chime.js";

type Listener = (event: SseEvent) => void;
let listener: Listener | null = null;

vi.mock("./useSSESync.js", () => ({
  useSSEEventListener: (l: Listener) => {
    listener = l;
  },
}));

const toastSpy = vi.fn();
vi.mock("@mattbutlerengineering/rialto", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

const getReservation = vi.fn();
vi.mock("./useApiClient.js", () => ({
  useApiClient: () => ({ reservations: { get: getReservation } }),
}));

const chimeSpy = vi.fn();
vi.mock("../lib/arrival-chime.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, playArrivalChime: () => chimeSpy() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}|${JSON.stringify(opts)}` : key,
  }),
}));

function reservation(over: Partial<Reservation> = {}): Reservation {
  return { id: "r1", guestName: "Ada Lovelace", partySize: 4, ...over } as Reservation;
}

function signal(reservationId: string, kind: "arrived" | "running-late"): SseEvent {
  return {
    type: "reservation:guest-signal",
    venueId: "v1",
    timestamp: "2026-11-11T18:00:00.000Z",
    data: kind === "arrived" ? { reservationId, kind } : { reservationId, kind, minutes: 15 },
  } as SseEvent;
}

function setup(cached?: Reservation[]) {
  const queryClient = new QueryClient();
  if (cached) queryClient.setQueryData(["reservations", { venueId: "v1" }], cached);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  renderHook(() => useArrivalAlerts(), { wrapper });
}

async function fire(event: SseEvent) {
  await act(async () => {
    listener?.(event);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useArrivalAlerts", () => {
  beforeEach(() => {
    localStorage.clear();
    listener = null;
    toastSpy.mockReset();
    chimeSpy.mockReset();
    getReservation.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows one toast with party name and size from the reservations cache, and chimes", async () => {
    setup([reservation()]);
    await fire(signal("r1", "arrived"));
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]![0].description).toContain('"name":"Ada Lovelace"');
    expect(toastSpy.mock.calls[0]![0].description).toContain('"size":4');
    expect(chimeSpy).toHaveBeenCalledTimes(1);
    expect(getReservation).not.toHaveBeenCalled();
  });

  it("fetches the reservation when it is not cached", async () => {
    getReservation.mockResolvedValue(reservation({ id: "r2", guestName: "Grace", partySize: 2 }));
    setup([]);
    await fire(signal("r2", "arrived"));
    expect(getReservation).toHaveBeenCalledWith("r2");
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]![0].description).toContain('"name":"Grace"');
  });

  it("falls back to a generic toast when the lookup fails, never throwing", async () => {
    getReservation.mockRejectedValue(new Error("offline"));
    setup([]);
    await fire(signal("r3", "arrived"));
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]![0].description).toBe("arrivalAlerts.descriptionUnknown");
    expect(chimeSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the guest fallback name when the reservation has none", async () => {
    setup([reservation({ guestName: null })]);
    await fire(signal("r1", "arrived"));
    expect(toastSpy.mock.calls[0]![0].description).toContain("reservations.guestFallback");
  });

  it("mute suppresses the chime but keeps the toast", async () => {
    setArrivalChimeMuted(true);
    setup([reservation()]);
    await fire(signal("r1", "arrived"));
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(chimeSpy).not.toHaveBeenCalled();
  });

  it("ignores running-late signals and other events", async () => {
    setup([reservation()]);
    await fire(signal("r1", "running-late"));
    await fire({ ...signal("r1", "arrived"), type: "reservation:updated" } as SseEvent);
    expect(toastSpy).not.toHaveBeenCalled();
    expect(chimeSpy).not.toHaveBeenCalled();
  });

  it("alerts once per reservation even if the event is re-delivered", async () => {
    setup([reservation()]);
    await fire(signal("r1", "arrived"));
    await fire(signal("r1", "arrived"));
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(chimeSpy).toHaveBeenCalledTimes(1);
  });
});

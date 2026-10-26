import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AvailabilityCheckResult } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

export const STAFF_BOOKING_CHECK_QUERY_KEY = "staffBookingCheck" as const;
/** The pause after the last change before the check runs (the API shares a per-IP rate bucket). */
const DEBOUNCE_MS = 400;

type BookingWindow = { start: string; end: string };

export interface StaffCheckParams {
  venueId: string | null | undefined;
  /** The booking's real start and end (ISO); null until date and time are both entered. */
  window: BookingWindow | null;
  partySize: number;
  /** The table the form has selected; empty means nothing to check. */
  selectedTableId: string;
}

export interface StaffCheckResult {
  /** `idle`: nothing to ask yet. `failed`: the check errored, so the server decides. */
  phase: "idle" | "checking" | "done" | "failed";
  verdict: AvailabilityCheckResult | null;
}

/**
 * Asks the booking gate whether it would take this phone booking for the selected table.
 * Read-only; the submit still passes through the gate, so a stale or failed answer cannot book.
 * The window is debounced before it reaches the query key, so typing a time sends one request.
 */
export function useStaffBookingCheck({
  venueId,
  window,
  partySize,
  selectedTableId,
}: StaffCheckParams): StaffCheckResult {
  const api = useApiClient();
  const [settled, setSettled] = useState<BookingWindow | null>(null);
  const startKey = window?.start;
  const endKey = window?.end;

  useEffect(() => {
    const timer = setTimeout(
      () => setSettled(startKey && endKey ? { start: startKey, end: endKey } : null),
      DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [startKey, endKey]);

  const enabled = !!venueId && !!selectedTableId && settled !== null && window !== null;
  const query = useQuery({
    queryKey: [
      STAFF_BOOKING_CHECK_QUERY_KEY,
      venueId,
      settled?.start,
      settled?.end,
      partySize,
      selectedTableId,
    ],
    queryFn: () =>
      api.availability.checkBooking(venueId as string, {
        start: (settled as BookingWindow).start,
        end: (settled as BookingWindow).end,
        partySize,
        channel: "phone",
        tableId: selectedTableId,
      }),
    enabled,
    retry: false,
  });

  if (window === null || !venueId || !selectedTableId) return { phase: "idle", verdict: null };
  // Still inside the pause: the answer on hand (if any) is for an earlier window.
  if (settled === null || settled.start !== window.start || settled.end !== window.end) {
    return { phase: "checking", verdict: null };
  }
  if (query.isError) return { phase: "failed", verdict: null };
  if (query.data === undefined) return { phase: "checking", verdict: null };
  return { phase: "done", verdict: query.data };
}

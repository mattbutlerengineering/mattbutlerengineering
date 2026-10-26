import { useQueries } from "@tanstack/react-query";
import type { AvailabilityCheckResult } from "@mbe/types";
import { useApiClient } from "./useApiClient.js";

export const STAFF_BOOKING_CHECK_QUERY_KEY = "staffBookingCheck" as const;

export interface StaffCheckParams {
  venueId: string | null | undefined;
  /** The booking's real start and end (ISO); null until date and time are both entered. */
  window: { start: string; end: string } | null;
  partySize: number;
  /** Every table the form offers; each is checked so blocked ones can be greyed out. */
  tableIds: readonly string[];
  selectedTableId: string;
}

export interface StaffCheckResult {
  /** `idle`: nothing to ask yet. `failed`: the selected table's check errored, so the server decides. */
  phase: "idle" | "checking" | "done" | "failed";
  /** The selected table's verdict, once known. */
  verdict: AvailabilityCheckResult | null;
  /** Tables the check refuses outright at this time (`table_blocked`). */
  blockedTableIds: ReadonlySet<string>;
}

/**
 * Asks the booking gate whether it would take this phone booking, for each candidate table.
 * Read-only; the submit still passes through the gate, so a stale or failed answer cannot book.
 */
export function useStaffBookingCheck({
  venueId,
  window,
  partySize,
  tableIds,
  selectedTableId,
}: StaffCheckParams): StaffCheckResult {
  const api = useApiClient();
  const enabled = !!venueId && window !== null;
  const results = useQueries({
    queries: tableIds.map((tableId) => ({
      queryKey: [
        STAFF_BOOKING_CHECK_QUERY_KEY,
        venueId,
        window?.start,
        window?.end,
        partySize,
        tableId,
      ],
      queryFn: () =>
        api.availability.checkBooking(venueId as string, {
          start: (window as { start: string }).start,
          end: (window as { end: string }).end,
          partySize,
          channel: "phone",
          tableId,
        }),
      enabled,
      retry: false,
    })),
  });

  const blockedTableIds = new Set<string>();
  tableIds.forEach((id, index) => {
    const data = results[index]?.data;
    if (data?.kind === "hard" && data.reason === "table_blocked") blockedTableIds.add(id);
  });

  const selected = results[tableIds.indexOf(selectedTableId)];
  if (!enabled || selected === undefined) {
    return { phase: "idle", verdict: null, blockedTableIds };
  }
  if (selected.isError) return { phase: "failed", verdict: null, blockedTableIds };
  if (selected.data === undefined) return { phase: "checking", verdict: null, blockedTableIds };
  return { phase: "done", verdict: selected.data, blockedTableIds };
}

import type { TimeSlot } from "@mbe/types";
import { createQueryHook } from "./create-query-hook.js";

export const OPEN_TIMES_QUERY_KEY = "staffOpenTimes" as const;

/** Bookable slots for a party on a date: the open-times strip under the staff form's time input. */
export const useOpenTimes = createQueryHook<
  TimeSlot[] | null,
  { venueId: string | null | undefined; date: string; partySize: number },
  TimeSlot[]
>({
  key: OPEN_TIMES_QUERY_KEY,
  fetcher: async (params, api) =>
    params?.venueId
      ? api.availability.getTimeSlots({
          venueId: params.venueId,
          date: params.date,
          partySize: params.partySize,
        })
      : null,
  getEnabled: (params) => !!params?.venueId && !!params.date && params.enabled !== false,
  select: (data) => (data ?? []).filter((slot) => slot.available),
});

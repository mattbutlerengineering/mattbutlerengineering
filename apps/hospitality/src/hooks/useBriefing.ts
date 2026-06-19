import { createQueryHook } from "./create-query-hook.js";

export const BRIEFING_QUERY_KEY = "briefing" as const;

export interface BriefingGuest {
  id: string;
  name: string;
  visitCount: number;
  lastVisit: string | null;
  dietaryRestrictions: string[] | null;
  notes: string | null;
  staffNotes: Array<{ text: string; createdBy: string; createdAt: string }>;
  tags: string[] | null;
  communicationPreference: string | null;
}

export interface BriefingEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: "PENDING" | "CONFIRMED";
  notes: string | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestId: string | null;
  userId: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  tableId: string;
  table?: { id: string; name: string; tableNumber: string | null } | null;
  venueId: string | null;
  createdAt: string;
  updatedAt: string;
  guest: BriefingGuest | null;
}

export interface UseBriefingParams {
  date: string;
  venueId: string;
  enabled?: boolean;
}

export const useBriefing = createQueryHook<BriefingEntry[], UseBriefingParams>({
  key: BRIEFING_QUERY_KEY,
  fetcher: async (params, api) => {
    if (!params) return [];
    const response = await api.client.get<{ data: BriefingEntry[] }>(
      `/api/v1/briefing?date=${encodeURIComponent(params.date)}&venueId=${encodeURIComponent(params.venueId)}`
    );
    return (response as { data: BriefingEntry[] }).data;
  },
  getEnabled: (params) => Boolean(params?.date && params?.venueId),
});

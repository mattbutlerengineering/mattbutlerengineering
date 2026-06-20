import type { ApiClient, QueryParams } from "./client.js";

export interface GetBriefingParams {
  date: string;
  venueId: string;
}

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

export class BriefingClient {
  constructor(private client: ApiClient) {}

  /**
   * Get tonight's service briefing — PENDING and CONFIRMED reservations for
   * the given date and venue, enriched with full guest CRM data.
   */
  async list(params: GetBriefingParams): Promise<BriefingEntry[]> {
    const response = await this.client.get<{ data: BriefingEntry[] }>(
      "/api/v1/briefing",
      params as unknown as QueryParams
    );
    return response.data;
  }
}

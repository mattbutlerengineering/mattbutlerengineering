import type { ApiClient } from "./client.js";

export interface BriefingGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  visitCount: number;
  lastVisit: string | null;
  dietaryRestrictions: string[] | null;
  tags: string[] | null;
  staffNotes: Array<{ text: string; createdBy: string; createdAt: string }>;
}

export interface BriefingReservation {
  id: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: "PENDING" | "CONFIRMED";
  notes: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  guestName: string | null;
  tableId: string;
  tableName: string | null;
  venueId: string | null;
  guest: BriefingGuest | null;
}

export interface BriefingResponse {
  date: string;
  venueId: string;
  reservations: BriefingReservation[];
}

export class BriefingClient {
  constructor(private client: ApiClient) {}

  async get(venueId: string, date?: string): Promise<BriefingResponse> {
    const params = new URLSearchParams({ venueId });
    if (date) params.set("date", date);
    return this.client.get<BriefingResponse>(`/api/v1/briefing?${params.toString()}`);
  }
}

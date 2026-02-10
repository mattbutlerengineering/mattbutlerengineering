import type {
  ApiResponse,
  TimeSlot,
  DateAvailability,
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

export interface GetTimeSlotsParams {
  venueId: string;
  date: string;
  partySize: number;
  duration?: number;
}

export interface GetDatesParams {
  venueId: string;
  startDate: string;
  endDate: string;
  partySize: number;
}

export class AvailabilityClient {
  constructor(private client: ApiClient) {}

  /**
   * Get available time slots for a venue on a specific date
   */
  async getTimeSlots(params: GetTimeSlotsParams): Promise<TimeSlot[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("date", params.date);
    searchParams.set("partySize", String(params.partySize));
    if (params.duration) searchParams.set("duration", String(params.duration));

    const response = await this.client.get<ApiResponse<TimeSlot[]>>(
      `/api/v1/availability/${params.venueId}?${searchParams.toString()}`
    );
    return response.data;
  }

  /**
   * Get dates with availability in a range
   */
  async getDates(params: GetDatesParams): Promise<DateAvailability[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("startDate", params.startDate);
    searchParams.set("endDate", params.endDate);
    searchParams.set("partySize", String(params.partySize));

    const response = await this.client.get<ApiResponse<DateAvailability[]>>(
      `/api/v1/availability/${params.venueId}/dates?${searchParams.toString()}`
    );
    return response.data;
  }
}

export class HoldsClient {
  private sessionId: string | null = null;

  constructor(private client: ApiClient) {}

  /**
   * Set session ID for hold operations
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Create a hold on a time slot
   */
  async create(data: CreateHoldRequest): Promise<{ hold: ReservationHold; sessionId: string }> {
    const headers: Record<string, string> = {};
    if (this.sessionId) {
      headers["x-session-id"] = this.sessionId;
    }

    const response = await this.client.request<ApiResponse<ReservationHold>>(
      "/api/v1/holds",
      {
        method: "POST",
        body: JSON.stringify(data),
        headers,
      }
    );

    // The session ID may be returned in the response headers
    // For now, use the one we have or generate one client-side
    const newSessionId = this.sessionId ?? crypto.randomUUID();
    this.sessionId = newSessionId;

    return { hold: response.data, sessionId: newSessionId };
  }

  /**
   * Get a hold by ID
   */
  async get(id: string): Promise<ReservationHold> {
    const response = await this.client.get<ApiResponse<ReservationHold>>(`/api/v1/holds/${id}`);
    return response.data;
  }

  /**
   * Release a hold
   */
  async release(id: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Session ID required to release hold");
    }

    await this.client.request<{ success: boolean }>(`/api/v1/holds/${id}`, {
      method: "DELETE",
      headers: {
        "x-session-id": this.sessionId,
      },
    });
  }

  /**
   * Confirm a hold and create a reservation
   */
  async confirm(id: string, details: ConfirmHoldRequest): Promise<ReservationHold> {
    if (!this.sessionId) {
      throw new Error("Session ID required to confirm hold");
    }

    const response = await this.client.request<ApiResponse<ReservationHold>>(
      `/api/v1/holds/${id}/confirm`,
      {
        method: "POST",
        body: JSON.stringify(details),
        headers: {
          "x-session-id": this.sessionId,
        },
      }
    );

    return response.data;
  }
}

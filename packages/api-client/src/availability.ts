import type {
  TimeSlot,
  DateAvailability,
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
  Reservation,
} from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

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
    const { venueId, ...query } = params;
    return this.client.getOne<TimeSlot[]>(`/api/v1/availability/${venueId}`, query as QueryParams);
  }

  /**
   * Get dates with availability in a range
   */
  async getDates(params: GetDatesParams): Promise<DateAvailability[]> {
    const { venueId, ...query } = params;
    return this.client.getOne<DateAvailability[]>(
      `/api/v1/availability/${venueId}/dates`,
      query as QueryParams
    );
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
    // Generate session ID before the request so create and confirm use the same ID
    if (!this.sessionId) {
      this.sessionId = crypto.randomUUID();
    }

    const response = await this.client.request<{ data: ReservationHold }>("/api/v1/holds", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "x-session-id": this.sessionId,
      },
    });

    return { hold: response.data, sessionId: this.sessionId };
  }

  /**
   * Get a hold by ID
   */
  async get(id: string): Promise<ReservationHold> {
    return this.client.getOne<ReservationHold>(`/api/v1/holds/${id}`);
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
  async confirm(id: string, details: ConfirmHoldRequest): Promise<Reservation> {
    if (!this.sessionId) {
      throw new Error("Session ID required to confirm hold");
    }

    const response = await this.client.request<{ data: Reservation }>(
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

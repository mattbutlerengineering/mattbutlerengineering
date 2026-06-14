import type {
  PaginatedResponse,
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
} from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

export interface ListReservationsParams {
  page?: number;
  limit?: number;
  date?: string;
  status?: ReservationStatus;
  tableId?: string;
  venueId?: string;
  guestId?: string;
}

export class ReservationsClient {
  constructor(private client: ApiClient) {}

  /**
   * List reservations with optional filters
   */
  async list(params: ListReservationsParams = {}): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      "/api/v1/reservations",
      params as QueryParams
    );
  }

  /**
   * Get current user's reservations
   */
  async me(page = 1, limit = 10): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      `/api/v1/reservations/me?page=${page}&limit=${limit}`
    );
  }

  /**
   * Get a reservation by ID
   */
  async get(id: string): Promise<Reservation> {
    return this.client.getOne<Reservation>(`/api/v1/reservations/${id}`);
  }

  /**
   * Create a new reservation
   */
  async create(data: CreateReservationRequest): Promise<Reservation> {
    return this.client.postOne<Reservation>("/api/v1/reservations", data);
  }

  /**
   * Update a reservation
   */
  async update(id: string, data: UpdateReservationRequest): Promise<Reservation> {
    return this.client.patchOne<Reservation>(`/api/v1/reservations/${id}`, data);
  }

  /**
   * Cancel a reservation
   */
  async cancel(id: string): Promise<Reservation> {
    const response = await this.client.request<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      { method: "DELETE" }
    );
    return response.data;
  }

  /**
   * Cancel a reservation with an optional reason and note
   */
  async cancelWithReason(
    id: string,
    reason?: { cancellationReason?: string; cancellationNote?: string }
  ): Promise<Reservation> {
    return this.update(id, {
      status: "CANCELLED",
      ...reason,
    });
  }

  /**
   * Create a walk-in reservation
   */
  async walkIn(data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
    durationMinutes?: number;
  }): Promise<Reservation> {
    return this.client.postOne<Reservation>("/api/v1/reservations/walk-in", data);
  }
}

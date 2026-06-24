import { z } from "zod";
import type {
  PaginatedResponse,
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
} from "@mbe/types";
import { ReservationSchema, paginatedResponseSchema } from "@mbe/types";
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

const reservationEnvelope = z.object({ data: ReservationSchema });
const reservationListSchema: z.ZodSchema<PaginatedResponse<Reservation>> =
  paginatedResponseSchema(ReservationSchema);

export class ReservationsClient {
  constructor(private client: ApiClient) {}

  /**
   * List reservations with optional filters
   */
  async list(params: ListReservationsParams = {}): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      "/api/v1/reservations",
      params as QueryParams,
      reservationListSchema
    );
  }

  /**
   * Get current user's reservations
   */
  async me(page = 1, limit = 10): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      `/api/v1/reservations/me?page=${page}&limit=${limit}`,
      undefined,
      reservationListSchema
    );
  }

  /**
   * Get a reservation by ID
   */
  async get(id: string): Promise<Reservation> {
    const response = await this.client.get<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      undefined,
      reservationEnvelope
    );
    return response.data;
  }

  /**
   * Create a new reservation
   */
  async create(data: CreateReservationRequest): Promise<Reservation> {
    const response = await this.client.post<{ data: Reservation }>(
      "/api/v1/reservations",
      data,
      reservationEnvelope
    );
    return response.data;
  }

  /**
   * Update a reservation
   */
  async update(id: string, data: UpdateReservationRequest): Promise<Reservation> {
    const response = await this.client.patch<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      data,
      reservationEnvelope
    );
    return response.data;
  }

  /**
   * Cancel a reservation
   */
  async cancel(id: string): Promise<Reservation> {
    const response = await this.client.request<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      { method: "DELETE" },
      reservationEnvelope
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
    const response = await this.client.post<{ data: Reservation }>(
      "/api/v1/reservations/walk-in",
      data,
      reservationEnvelope
    );
    return response.data;
  }
}

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
const reservationListSchema = paginatedResponseSchema(ReservationSchema);

const RESERVATION_BASE_PATH = "/api/v1/reservations";

export class ReservationsClient {
  constructor(private client: ApiClient) {}

  /**
   * List reservations with optional filters
   */
  async list(params: ListReservationsParams = {}): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      RESERVATION_BASE_PATH,
      params as QueryParams,
      // PaginatedResponse<T> has a nested `pagination` object in the TS type but the
      // actual API returns a flat shape (data, total, page, limit). The schema matches
      // the real wire format; cast through unknown to satisfy the TS return type.
      reservationListSchema as unknown as z.ZodSchema<PaginatedResponse<Reservation>>
    );
  }

  /**
   * Get current user's reservations
   */
  async me(page = 1, limit = 10): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      `${RESERVATION_BASE_PATH}/me?page=${page}&limit=${limit}`,
      undefined,
      // PaginatedResponse<T> has a nested `pagination` object in the TS type but the
      // actual API returns a flat shape (data, total, page, limit). The schema matches
      // the real wire format; cast through unknown to satisfy the TS return type.
      reservationListSchema as unknown as z.ZodSchema<PaginatedResponse<Reservation>>
    );
  }

  /**
   * Get a reservation by ID
   */
  async get(id: string): Promise<Reservation> {
    const response = await this.client.get<{ data: Reservation }>(
      `${RESERVATION_BASE_PATH}/${id}`,
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
      RESERVATION_BASE_PATH,
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
      `${RESERVATION_BASE_PATH}/${id}`,
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
      `${RESERVATION_BASE_PATH}/${id}`,
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
    const response = await this.client.patch<{ data: Reservation }>(
      `${RESERVATION_BASE_PATH}/${id}`,
      {
        status: "CANCELLED",
        ...reason,
      },
      reservationEnvelope
    );
    return response.data;
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
      `${RESERVATION_BASE_PATH}/walk-in`,
      data,
      reservationEnvelope
    );
    return response.data;
  }
}

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

export class ReservationsClient {
  constructor(private client: ApiClient) {}

  async list(params: ListReservationsParams = {}): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      "/api/v1/reservations",
      params as QueryParams,
      // PaginatedResponse<T> has a nested `pagination` object in the TS type but the
      // actual API returns a flat shape (data, total, page, limit). The schema matches
      // the real wire format; cast through unknown to satisfy the TS return type.
      reservationListSchema as unknown as z.ZodSchema<PaginatedResponse<Reservation>>
    );
  }

  async me(page = 1, limit = 10): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      `/api/v1/reservations/me?page=${page}&limit=${limit}`,
      undefined,
      // PaginatedResponse<T> has a nested `pagination` object in the TS type but the
      // actual API returns a flat shape (data, total, page, limit). The schema matches
      // the real wire format; cast through unknown to satisfy the TS return type.
      reservationListSchema as unknown as z.ZodSchema<PaginatedResponse<Reservation>>
    );
  }

  async get(id: string): Promise<Reservation> {
    const response = await this.client.get<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      undefined,
      reservationEnvelope
    );
    return response.data;
  }

  async create(data: CreateReservationRequest): Promise<Reservation> {
    const response = await this.client.post<{ data: Reservation }>(
      "/api/v1/reservations",
      data,
      reservationEnvelope
    );
    return response.data;
  }

  async update(id: string, data: UpdateReservationRequest): Promise<Reservation> {
    const response = await this.client.patch<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      data,
      reservationEnvelope
    );
    return response.data;
  }

  async cancel(id: string): Promise<Reservation> {
    const response = await this.client.request<{ data: Reservation }>(
      `/api/v1/reservations/${id}`,
      { method: "DELETE" },
      reservationEnvelope
    );
    return response.data;
  }

  async cancelWithReason(
    id: string,
    reason?: { cancellationReason?: string; cancellationNote?: string }
  ): Promise<Reservation> {
    return this.update(id, {
      status: "CANCELLED",
      ...reason,
    });
  }

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

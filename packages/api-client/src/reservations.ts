import type {
  ApiResponse,
  PaginatedResponse,
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
} from "@mbe/types";
import type { ApiClient } from "./client.js";

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
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.date) searchParams.set("date", params.date);
    if (params.status) searchParams.set("status", params.status);
    if (params.tableId) searchParams.set("tableId", params.tableId);
    if (params.venueId) searchParams.set("venueId", params.venueId);
    if (params.guestId) searchParams.set("guestId", params.guestId);

    const query = searchParams.toString();
    return this.client.get<PaginatedResponse<Reservation>>(
      `/api/v1/reservations${query ? `?${query}` : ""}`
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
    const response = await this.client.get<ApiResponse<Reservation>>(
      `/api/v1/reservations/${id}`
    );
    return response.data;
  }

  /**
   * Create a new reservation
   */
  async create(data: CreateReservationRequest): Promise<Reservation> {
    const response = await this.client.post<ApiResponse<Reservation>>(
      "/api/v1/reservations",
      data
    );
    return response.data;
  }

  /**
   * Update a reservation
   */
  async update(id: string, data: UpdateReservationRequest): Promise<Reservation> {
    const response = await this.client.patch<ApiResponse<Reservation>>(
      `/api/v1/reservations/${id}`,
      data
    );
    return response.data;
  }

  /**
   * Cancel a reservation
   */
  async cancel(id: string): Promise<Reservation> {
    const response = await this.client.delete(`/api/v1/reservations/${id}`) as unknown as ApiResponse<Reservation>;
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
    const response = await this.client.post<ApiResponse<Reservation>>(
      "/api/v1/reservations/walk-in",
      data
    );
    return response.data;
  }
}

import { z } from "zod";
import type {
  PaginatedResponse,
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
} from "@mbe/types";
import { ReservationSchema, ReservationStatusSchema, paginatedResponseSchema } from "@mbe/types";
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

const reservationListSchema: z.ZodSchema<PaginatedResponse<Reservation>> =
  paginatedResponseSchema(ReservationSchema);

/**
 * Guest-facing reservation view returned by the public manage-token lookup.
 * Deliberately narrower than the full domain Reservation — the unauthenticated
 * endpoint withholds cancellation fields and guestPhone.
 */
export interface ManagedReservation {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string | null;
  guestEmail: string | null;
  status: ReservationStatus;
  notes: string | null;
}

export interface ManagedReservationVenue {
  id: string;
  name: string;
  slug: string;
  ianaTimezone: string;
}

export interface ManageReservationData {
  reservation: ManagedReservation;
  venue: ManagedReservationVenue | null;
}

const manageReservationDataSchema: z.ZodSchema<ManageReservationData> = z.object({
  reservation: z.object({
    id: z.string(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    partySize: z.number(),
    guestName: z.string().nullable(),
    guestEmail: z.string().nullable(),
    status: ReservationStatusSchema,
    notes: z.string().nullable(),
  }),
  venue: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      ianaTimezone: z.string(),
    })
    .nullable(),
});

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
      reservationListSchema
    );
  }

  /**
   * Get current user's reservations
   */
  async me(page = 1, limit = 10): Promise<PaginatedResponse<Reservation>> {
    return this.client.get<PaginatedResponse<Reservation>>(
      `${RESERVATION_BASE_PATH}/me?page=${page}&limit=${limit}`,
      undefined,
      reservationListSchema
    );
  }

  /**
   * Get a reservation by ID
   */
  async get(id: string): Promise<Reservation> {
    return this.client.getOne<Reservation>(
      `${RESERVATION_BASE_PATH}/${id}`,
      undefined,
      ReservationSchema
    );
  }

  /**
   * Create a new reservation
   */
  async create(data: CreateReservationRequest): Promise<Reservation> {
    return this.client.postOne<Reservation>(RESERVATION_BASE_PATH, data, ReservationSchema);
  }

  /**
   * Update a reservation
   */
  async update(id: string, data: UpdateReservationRequest): Promise<Reservation> {
    return this.client.patchOne<Reservation>(
      `${RESERVATION_BASE_PATH}/${id}`,
      data,
      ReservationSchema
    );
  }

  /**
   * Cancel a reservation
   */
  async cancel(id: string): Promise<Reservation> {
    return this.client.deleteOne<Reservation>(`${RESERVATION_BASE_PATH}/${id}`, ReservationSchema);
  }

  /**
   * Cancel a reservation with an optional reason and note
   */
  async cancelWithReason(
    id: string,
    reason?: { cancellationReason?: string; cancellationNote?: string }
  ): Promise<Reservation> {
    return this.client.patchOne<Reservation>(
      `${RESERVATION_BASE_PATH}/${id}`,
      {
        status: "CANCELLED",
        ...reason,
      },
      ReservationSchema
    );
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
    return this.client.postOne<Reservation>(
      `${RESERVATION_BASE_PATH}/walk-in`,
      data,
      ReservationSchema
    );
  }

  /**
   * Look up a reservation via a guest-facing manage token (public, unauthenticated).
   * Encodes the token internally and unwraps the `{ data }` envelope.
   */
  async manageReservation(token: string): Promise<ManageReservationData> {
    return this.client.getOne<ManageReservationData>(
      `/public/v1/reservations/manage?token=${encodeURIComponent(token)}`,
      undefined,
      manageReservationDataSchema
    );
  }
}

import { z } from "zod";
import type {
  PaginatedResponse,
  Reservation,
  ReservationStatus,
  CreateReservationRequest,
  UpdateReservationRequest,
  WalkInRequest,
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
  /** Contact phone number shown to guests on the manage-reservation page (#4979). */
  phone?: string;
  /** Hours before start after which guests can no longer modify; null = venue default (#6907). */
  modificationCutoffHours?: number | null;
  /** Largest party-size change a guest may make; null = unlimited (#6907). */
  maxPartySizeChange?: number | null;
}

/** Fields a guest may change through the manage token. */
export interface ManagedReservationChanges {
  date?: string;
  startTime?: string;
  endTime?: string;
  partySize?: number;
  specialRequests?: string;
}

/** One open time offered to a guest whose booking the venue cancelled. `id` is the slot's start instant. */
export interface ManagedRebookOffer {
  id: string;
  /** Service date the slot belongs to (differs from the local date for after-midnight times). */
  date: string;
  /** ISO instant the slot starts. */
  startTime: string;
}

/** Present only when a venue closure cancelled the booking. */
export interface ManagedVenueCancellation {
  refundStatus: "none" | "pending" | "done" | "failed";
  /** The service date (YYYY-MM-DD) the venue was closed; null when an older API did not send it. */
  closureDate: string | null;
  /** The venue's guest message for the closure; free text, render as text only. */
  closureMessage: string | null;
  /** Empty once rebooked, and where the new booking would need a deposit (the guest uses the full picker). */
  offers: ManagedRebookOffer[];
  /** Set once the guest has rebooked; `manageToken` opens the new reservation. */
  rebooked: { startTime: string; manageToken: string } | null;
}

/** The outcome of a one-tap rebook. */
export interface RebookedReservation {
  reservationId: string;
  startTime: string;
  manageToken: string;
}

export interface ManageReservationData {
  reservation: ManagedReservation;
  venue: ManagedReservationVenue | null;
  venueCancellation?: ManagedVenueCancellation | null;
}

const managedReservationSchema: z.ZodSchema<ManagedReservation> = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  partySize: z.number(),
  guestName: z.string().nullable(),
  guestEmail: z.string().nullable(),
  status: ReservationStatusSchema,
  notes: z.string().nullable(),
});

const manageReservationDataSchema: z.ZodSchema<ManageReservationData> = z.object({
  reservation: managedReservationSchema,
  venue: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      ianaTimezone: z.string(),
      phone: z.string().optional(),
      modificationCutoffHours: z.number().nullable().optional(),
      maxPartySizeChange: z.number().nullable().optional(),
    })
    .nullable(),
  venueCancellation: z
    .object({
      refundStatus: z.enum(["none", "pending", "done", "failed"]),
      closureDate: z.string().nullable().default(null),
      closureMessage: z.string().nullable().default(null),
      offers: z.array(z.object({ id: z.string(), date: z.string(), startTime: z.string() })),
      rebooked: z.object({ startTime: z.string(), manageToken: z.string() }).nullable(),
    })
    .nullable()
    .optional(),
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
   * Mark a reservation as a no-show. A thin wrapper over the same PATCH
   * `update()` uses, but reads through `patch()` (not `patchOne()`'s
   * `{ data: T }`-only envelope) to also surface the optional top-level
   * `warning` the server sets when something non-fatal needs staff attention
   * (e.g. the deposit was still pending, or was written off as
   * uncollectable) — `patchOne()`'s envelope schema silently strips any key
   * besides `data` (#5719 M2).
   */
  async markNoShow(id: string): Promise<{ reservation: Reservation; warning?: string }> {
    const envelopeSchema = z.object({ data: ReservationSchema, warning: z.string().optional() });
    const response = await this.client.patch(
      `${RESERVATION_BASE_PATH}/${id}`,
      { status: "NO_SHOW" },
      envelopeSchema
    );
    return { reservation: response.data, ...(response.warning && { warning: response.warning }) };
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
  async walkIn(data: WalkInRequest): Promise<Reservation> {
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

  /**
   * Cancel a reservation via a guest-facing manage token (public, unauthenticated).
   * The token is sent as an `Authorization: Bearer` header rather than a query
   * param — the manage-token middleware prefers it for mutating requests.
   */
  async cancelManaged(
    token: string,
    reason?: { cancellationReason?: string; cancellationNote?: string }
  ): Promise<{ status: ReservationStatus }> {
    const schema = z.object({ status: ReservationStatusSchema });
    const response = await this.client.request<{ data: { status: ReservationStatus } }>(
      "/public/v1/reservations/manage",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        body: reason ? JSON.stringify(reason) : undefined,
      },
      z.object({ data: schema })
    );
    return response.data;
  }

  /**
   * Rebook a venue-cancelled reservation into one of its offers (public,
   * token-authenticated). `offerId` is the offer's `id`. Refusals surface as
   * `ApiClientError`: 409 (already rebooked / slot gone) and 422 (the venue
   * takes a deposit, or the booking gate refuses the time).
   */
  async rebookManaged(token: string, offerId: string): Promise<RebookedReservation> {
    const schema = z.object({
      data: z.object({ reservationId: z.string(), startTime: z.string() }),
      manageToken: z.string(),
    });
    const response = await this.client.request<{
      data: { reservationId: string; startTime: string };
      manageToken: string;
    }>(
      "/public/v1/reservations/manage/rebook",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ offerId }),
      },
      schema
    );
    return { ...response.data, manageToken: response.manageToken };
  }

  /**
   * Modify a reservation via a guest-facing manage token (public, unauthenticated).
   * When a hold is passed, its id goes in the body and its session in
   * `x-session-id` so the server can prove the guest owns the new slot.
   */
  async modifyManaged(
    token: string,
    changes: ManagedReservationChanges,
    hold?: { holdId: string; sessionId: string }
  ): Promise<ManagedReservation> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (hold) headers["x-session-id"] = hold.sessionId;
    const response = await this.client.request<{ data: { reservation: ManagedReservation } }>(
      "/public/v1/reservations/manage",
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(hold ? { ...changes, holdId: hold.holdId } : changes),
      },
      z.object({ data: z.object({ reservation: managedReservationSchema }) })
    );
    return response.data.reservation;
  }
}

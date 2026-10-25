import type { z } from "zod";
import type {
  TimeSlot,
  PublicAvailabilityResponse,
  DateAvailability,
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
  Reservation,
  AvailabilityConfigState,
  AvailabilityConfigSaveResult,
  AvailabilityDaySummary,
  ClosureImpact,
  DateRule,
  PutAvailabilityConfigBodySchema,
} from "@mbe/types";
import { availabilityConfigEndpoints } from "@mbe/types";
import type { ApiClient, QueryParams } from "./client.js";

export interface GetTimeSlotsParams {
  venueId: string;
  date: string;
  partySize: number;
  duration?: number;
}

export interface GetVenueTimeSlotsParams {
  date: string;
  partySize: number;
}

export interface GetDatesParams {
  venueId: string;
  startDate: string;
  endDate: string;
  partySize: number;
}

/** What `saveConfig` sends; `scopeConflicts` defaults to `keep`. */
export type SaveAvailabilityConfigRequest = z.input<typeof PutAvailabilityConfigBodySchema>;

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
   * Get available time slots for a venue addressed by slug — the public,
   * unauthenticated route the anonymous booking widget must use. Unlike
   * {@link getTimeSlots} (staff, JWT-gated), the server resolves the venue
   * from the slug and returns only available slots; `duration` is not
   * accepted because the venue's own turn-time rules decide it.
   */
  async getTimeSlotsForVenue(slug: string, params: GetVenueTimeSlotsParams): Promise<TimeSlot[]> {
    return this.client.getOne<TimeSlot[]>(publicAvailabilityPath(slug), {
      date: params.date,
      partySize: params.partySize,
    });
  }

  /**
   * Same public route as {@link getTimeSlotsForVenue}, but returns the whole
   * response — the slots plus the engine's per-date `closure` and venue-level
   * `bookingPaused` — for callers that must tell "closed" from "fully booked".
   */
  async getPublicAvailability(
    slug: string,
    params: GetVenueTimeSlotsParams
  ): Promise<PublicAvailabilityResponse> {
    return this.client.get<PublicAvailabilityResponse>(publicAvailabilityPath(slug), {
      date: params.date,
      partySize: params.partySize,
    });
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

  /** A venue's availability config and the `version` a save must send back. */
  async getConfig(venueId: string): Promise<AvailabilityConfigState> {
    const response = await this.client.call(availabilityConfigEndpoints.getConfig, {
      params: { id: venueId },
    });
    return response.data;
  }

  /**
   * Save config changes with a compare-and-set on `expectedVersion`. A stale
   * version, an invalid config and a change that strands bookings reject with
   * an `ApiClientError` whose `problemDetails.code` is `version-conflict`
   * (with `winningChange`), `invalid-config` (with `issues`) or
   * `stranded-bookings` (with `reservations`).
   */
  async saveConfig(
    venueId: string,
    body: SaveAvailabilityConfigRequest
  ): Promise<AvailabilityConfigSaveResult> {
    const response = await this.client.call(availabilityConfigEndpoints.putConfig, {
      params: { id: venueId },
      body,
    });
    return response.data;
  }

  /**
   * Read-only preview of which future bookings a draft date rule (closure,
   * special hours or Tonight change) would affect, grouped by date and kind.
   * Requires a Manager.
   */
  async getClosureImpact(venueId: string, rule: DateRule): Promise<ClosureImpact> {
    const response = await this.client.call(availabilityConfigEndpoints.closureImpact, {
      params: { id: venueId },
      body: { rule },
    });
    return response.data;
  }

  /** Calendar summaries for each service date from `from` to `to` inclusive (≤62 days). */
  async listDays(
    venueId: string,
    range: { from: string; to: string }
  ): Promise<AvailabilityDaySummary[]> {
    const response = await this.client.call(availabilityConfigEndpoints.listDays, {
      params: { id: venueId },
      query: { from: range.from, to: range.to },
    });
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
   * Confirm a hold and create a reservation. `manageToken` (present whenever
   * the server can mint one) is the self-service token for the manage/cancel
   * page — callers thread it into the guest-facing confirmation UI.
   */
  async confirm(
    id: string,
    details: ConfirmHoldRequest
  ): Promise<{ reservation: Reservation; manageToken?: string }> {
    if (!this.sessionId) {
      throw new Error("Session ID required to confirm hold");
    }

    const response = await this.client.request<{ data: Reservation; manageToken?: string }>(
      `/api/v1/holds/${id}/confirm`,
      {
        method: "POST",
        body: JSON.stringify(details),
        headers: {
          "x-session-id": this.sessionId,
        },
      }
    );

    return { reservation: response.data, manageToken: response.manageToken };
  }

  /* ── Public, slug-scoped hold surface (#4487) ───────────────────────────
   * The four methods above target the staff hold routes, which require a JWT.
   * Anonymous callers (the embeddable booking widget) use the methods below:
   * the venue is named by slug and resolved server-side, never taken from a
   * client-supplied `venueId`, and the per-IP active-hold cap applies. Each
   * carries the same `x-session-id` capability token, which for this path is
   * minted by the server at create time and returned on the hold.
   */

  /**
   * Create a hold on a time slot for a venue addressed by slug. `endTime` is
   * derived server-side from the venue's turn-time rules, so it is not sent.
   */
  async createForVenue(
    slug: string,
    data: { date: string; startTime: string; partySize: number }
  ): Promise<{ hold: ReservationHold; sessionId: string }> {
    const response = await this.client.request<{ data: ReservationHold }>(publicHoldsPath(slug), {
      method: "POST",
      body: JSON.stringify(data),
    });

    // Unlike the staff route, the server mints the session id here — adopt it
    // so the subsequent get/release/confirm can prove ownership.
    this.sessionId = response.data.sessionId;
    return { hold: response.data, sessionId: response.data.sessionId };
  }

  /** Get a hold by ID, scoped to the venue slug that created it. */
  async getForVenue(slug: string, holdId: string): Promise<ReservationHold> {
    const response = await this.client.request<{ data: ReservationHold }>(
      `${publicHoldsPath(slug)}/${holdId}`,
      { headers: this.sessionHeaders("read") }
    );

    return response.data;
  }

  /** Release a hold, scoped to the venue slug that created it. */
  async releaseForVenue(slug: string, holdId: string): Promise<void> {
    await this.client.request<void>(`${publicHoldsPath(slug)}/${holdId}`, {
      method: "DELETE",
      headers: this.sessionHeaders("release"),
    });
  }

  /**
   * Confirm a hold into a reservation, scoped to the venue slug that created
   * it. `guestId` is deliberately absent from the accepted details — only the
   * authenticated staff route may attach a hold to an existing guest record.
   */
  async confirmForVenue(
    slug: string,
    holdId: string,
    details: { guestName?: string; guestEmail?: string; guestPhone?: string; notes?: string }
  ): Promise<{ reservation: Reservation; manageToken?: string }> {
    const response = await this.client.request<{ data: Reservation; manageToken?: string }>(
      `${publicHoldsPath(slug)}/${holdId}/confirm`,
      {
        method: "POST",
        body: JSON.stringify(details),
        headers: this.sessionHeaders("confirm"),
      }
    );

    return { reservation: response.data, manageToken: response.manageToken };
  }

  /** Session-id header for the public path; throws when ownership is unprovable. */
  private sessionHeaders(action: string): Record<string, string> {
    if (!this.sessionId) {
      throw new Error(`Session ID required to ${action} hold`);
    }
    return { "x-session-id": this.sessionId };
  }
}

function publicAvailabilityPath(slug: string): string {
  return `/public/v1/venues/${slug}/availability`;
}

function publicHoldsPath(slug: string): string {
  return `/public/v1/venues/${slug}/holds`;
}

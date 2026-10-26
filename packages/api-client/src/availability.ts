import type { z } from "zod";
import type {
  TimeSlot,
  PublicAvailabilityResponse,
  PublicClosedDate,
  DateAvailability,
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
  Reservation,
  AvailabilityConfigState,
  AvailabilityConfigSaveResult,
  AvailabilityChangesPage,
  AvailabilityChangesQuery,
  AvailabilityDaySummary,
  ClosureAlongside,
  ClosureImpact,
  ClosureResult,
  ClosureSummary,
  ClosureCallListEntry,
  RetryRefundsResult,
  CreateClosureBodySchema,
  DateRule,
  ReopenResult,
  SetTonightBodySchema,
  TonightResult,
  AvailabilityCheckBody,
  AvailabilityCheckResult,
  PreviewAvailabilityBody,
  PreviewResult,
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

/** What `createClosure` sends; `decisions` defaults to none. */
export type CreateClosureRequest = z.input<typeof CreateClosureBodySchema>;

/** What `setTonight` sends; `decisions` defaults to none. */
export type SetTonightRequest = z.input<typeof SetTonightBodySchema>;

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
   * The dates in `from`..`to` (at most 60 days) the venue is closed, each with
   * its guest message, from the public route — so a calendar can disable them
   * before a guest picks one.
   */
  async getClosedDates(
    slug: string,
    range: { from: string; to: string }
  ): Promise<PublicClosedDate[]> {
    return this.client.getOne<PublicClosedDate[]>(`${publicAvailabilityPath(slug)}/dates`, {
      from: range.from,
      to: range.to,
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
  async getClosureImpact(
    venueId: string,
    rule: DateRule,
    alongside?: ClosureAlongside
  ): Promise<ClosureImpact> {
    const response = await this.client.call(availabilityConfigEndpoints.closureImpact, {
      params: { id: venueId },
      body: alongside ? { rule, alongside } : { rule },
    });
    return response.data;
  }

  /**
   * Saves a closure (or special hours / Tonight change) with one decision per
   * affected group. `idempotencyKey` makes a retry safe: a replay returns the
   * first result, so the call is retried on a network error. Rejects with a
   * problem `code` of `version-conflict`, `decision-required`,
   * `invalid-decision`, `move-unavailable` or `invalid-config`.
   */
  async createClosure(
    venueId: string,
    body: CreateClosureRequest,
    idempotencyKey: string
  ): Promise<ClosureResult> {
    const response = await this.client.call(
      availabilityConfigEndpoints.createClosure,
      { params: { id: venueId }, body },
      { headers: { "Idempotency-Key": idempotencyKey }, idempotentRetry: true }
    );
    return response.data;
  }

  /**
   * What an unsaved draft changes: per-date added/removed times for 30 days
   * from `focusDate`, the focus day, and a page of the future bookings in
   * `scope` it would strand. Read-only, so a gateway failure is retried. A
   * 503 `preview-timeout` rejects with an `ApiClientError`; keep the last
   * good preview.
   */
  async previewConfig(venueId: string, body: PreviewAvailabilityBody): Promise<PreviewResult> {
    const response = await this.client.call(
      availabilityConfigEndpoints.previewAvailability,
      { params: { id: venueId }, body },
      { idempotentRetry: true }
    );
    return response.data;
  }

  /**
   * A page of the venue's availability history, newest first. `revertible`
   * marks the one change that can still be undone.
   */
  async listChanges(
    venueId: string,
    query: AvailabilityChangesQuery = {}
  ): Promise<AvailabilityChangesPage> {
    const response = await this.client.call(availabilityConfigEndpoints.listChanges, {
      params: { id: venueId },
      query,
    });
    return response.data;
  }

  /**
   * Undo a change by applying its stored inverse as a new save. Requires a
   * Manager. Rejects with an `ApiClientError` whose `problemDetails.code` is
   * `guests-notified`, `already-reverted`, `superseded`, `not-revertable`,
   * `version-conflict` or `stranded-bookings`.
   */
  async revertChange(
    venueId: string,
    changeId: string,
    expectedVersion: number
  ): Promise<AvailabilityConfigSaveResult> {
    const response = await this.client.call(availabilityConfigEndpoints.revertChange, {
      params: { id: venueId, changeId },
      body: { expectedVersion },
    });
    return response.data;
  }

  /** Sent / Rebooked / Unreachable and refund counts per closure (Special dates tab). */
  async listClosures(venueId: string): Promise<ClosureSummary[]> {
    const response = await this.client.call(availabilityConfigEndpoints.listClosures, {
      params: { id: venueId },
    });
    return response.data;
  }

  /** Guests a closure told without a confirmed delivery or rebooking. */
  async closureCallList(venueId: string, ruleId: string): Promise<ClosureCallListEntry[]> {
    const response = await this.client.call(availabilityConfigEndpoints.closureCallList, {
      params: { id: venueId, ruleId },
    });
    return response.data;
  }

  /** Re-enqueues a closure's `pending` / `failed` refunds (Manager). */
  async retryClosureRefunds(venueId: string, ruleId: string): Promise<RetryRefundsResult> {
    const response = await this.client.call(availabilityConfigEndpoints.retryClosureRefunds, {
      params: { id: venueId, ruleId },
    });
    return response.data;
  }

  /** Reopens a closure; guests it cancelled stay cancelled. */
  async reopenClosure(
    venueId: string,
    ruleId: string,
    tellCancelledGuests: boolean
  ): Promise<ReopenResult> {
    const response = await this.client.call(availabilityConfigEndpoints.reopenClosure, {
      params: { id: venueId, ruleId },
      body: { tellCancelledGuests },
    });
    return response.data;
  }

  /**
   * Applies one Tonight change (pause online, close early, stop a window,
   * block tables, pacing) for the current service day; it ends at the day's
   * boundary on its own. `body.ruleId` makes a retry safe. A close-early with
   * bookings rejects with `decision-required` until `decisions` answer each
   * affected group.
   */
  async setTonight(venueId: string, body: SetTonightRequest): Promise<TonightResult> {
    const response = await this.client.call(
      availabilityConfigEndpoints.setTonight,
      { params: { id: venueId }, body },
      { idempotentRetry: true }
    );
    return response.data;
  }

  /** Ends a Tonight change early; bookings a close-early cancelled stay cancelled. */
  async endTonight(venueId: string, ruleId: string): Promise<ReopenResult> {
    const response = await this.client.call(availabilityConfigEndpoints.endTonight, {
      params: { id: venueId, ruleId },
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

  /**
   * Ask the booking gate whether it would take a staff (phone) booking:
   * `ok`, `soft` (limits a reason can override), or `hard` (closures, never
   * overridable), each with a human message.
   */
  async checkBooking(
    venueId: string,
    body: AvailabilityCheckBody
  ): Promise<AvailabilityCheckResult> {
    const response = await this.client.call(availabilityConfigEndpoints.check, {
      params: { id: venueId },
      body,
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

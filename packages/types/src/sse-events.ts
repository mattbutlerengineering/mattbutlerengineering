/**
 * SSE event catalog — the single source of truth for the server-sent event
 * vocabulary between services/reservations (emitter) and apps/hospitality
 * (useSSESync).
 *
 * One row per event: its name, its payload type (SsePayloadMap), and the
 * React Query keys a client invalidates when it arrives. The server's event
 * union and the client's subscription list, invalidation, and handler switch
 * are all derived from here, so adding live refresh for a new event is one
 * row and drifting either side is a type error.
 */

import type { Reservation, Table } from "./reservation.js";
import type { ReservationHold } from "./availability.js";
import type { FloorPlan } from "./floor-plan.js";
import type { LapsingGuest } from "./guest.js";
import type { TableStatusDelta } from "./table-status.js";

/** Payload carried in `data` for each SSE event name. */
export interface SsePayloadMap {
  "reservation:created": Reservation;
  "reservation:updated": Reservation;
  "reservation:cancelled": Reservation;
  "hold:created": ReservationHold;
  "hold:released": ReservationHold;
  "hold:confirmed": Reservation;
  "table:updated": Table;
  "floor-plan:created": FloorPlan;
  "guest:lapsing": LapsingGuest[];
  "table-status:changed": TableStatusDelta[];
}

/** Every SSE event name the server can emit. */
export type SseEventName = keyof SsePayloadMap;

/**
 * Client query-key roots an SSE event may invalidate. Each value equals the
 * matching `*_QUERY_KEY` constant in apps/hospitality (pinned there by a
 * `satisfies` check and a test); @mbe/types never imports from an app.
 */
export type SseQueryKey = "reservations" | "tables" | "floorPlans" | "floorPlan" | "lapsingGuests";

export interface SseEventDefinition {
  /** Query-key roots to invalidate when this event arrives (may be empty). */
  readonly invalidates: readonly SseQueryKey[];
}

/** The catalog. Exactly one row per SseEventName — a missing or extra row is a type error. */
export const SSE_EVENT_CATALOG = {
  "reservation:created": { invalidates: ["reservations"] },
  "reservation:updated": { invalidates: ["reservations"] },
  "reservation:cancelled": { invalidates: ["reservations"] },
  "hold:created": { invalidates: [] },
  "hold:released": { invalidates: [] },
  "hold:confirmed": { invalidates: ["reservations"] },
  "table:updated": { invalidates: ["tables"] },
  "floor-plan:created": { invalidates: ["floorPlans", "floorPlan"] },
  "guest:lapsing": { invalidates: ["lapsingGuests"] },
  "table-status:changed": { invalidates: [] },
} as const satisfies { readonly [K in SseEventName]: SseEventDefinition };

/** Every catalog event name, in catalog order — the client's subscription list. */
export const SSE_EVENT_NAMES = Object.keys(SSE_EVENT_CATALOG) as readonly SseEventName[];

/** The wire envelope for one SSE event, as emitted by the server and parsed by the client. */
export interface SseEvent {
  type: SseEventName;
  venueId: string;
  timestamp: string;
  data: SsePayloadMap[SseEventName];
}

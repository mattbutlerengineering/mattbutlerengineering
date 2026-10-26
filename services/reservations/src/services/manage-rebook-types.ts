import type { BookingSnapshot } from "@mbe/availability";
import type { CreateHoldRequest, Reservation } from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import type { ConfirmHoldInput, ConfirmHoldResult } from "./confirm-hold.js";
import type { CreateHoldResult } from "./hold.js";

export type GuestRefundStatus = "none" | "pending" | "done" | "failed";

export interface CancelOutcome {
  id: string;
  refund: GuestRefundStatus;
  rebookedReservationId: string | null;
  /** The closure rule's guest-facing message (never the staff note). */
  guestMessage: string | null;
}

export interface RebookDeps {
  findCancelOutcome(reservationId: string, venueId: string): Promise<CancelOutcome | null>;
  findRebooked(reservationId: string): Promise<{ id: string; startTime: Date } | null>;
  /** Whether a new booking for this guest would need a deposit (fails closed). */
  requiresDeposit(venueId: string, reservation: Reservation): Promise<boolean>;
  loadSnapshot(
    venueId: string,
    from: string,
    to: string,
    now: Date
  ): Promise<{ snapshot: BookingSnapshot }>;
  createHold(data: CreateHoldRequest, sessionId: string): Promise<CreateHoldResult>;
  confirmHold(input: ConfirmHoldInput): Promise<ConfirmHoldResult>;
  releaseHold(holdId: string, sessionId: string): Promise<boolean>;
  /** Sets `rebookedReservationId` if still unset; false when another rebook won. */
  linkOutcome(
    tx: Prisma.TransactionClient,
    outcomeId: string,
    reservationId: string
  ): Promise<boolean>;
}

/** What the manage read needs; the rebook action adds booking to it. */
export type VenueCancellationDeps = Pick<
  RebookDeps,
  "findCancelOutcome" | "findRebooked" | "requiresDeposit" | "loadSnapshot"
>;

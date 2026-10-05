/**
 * The caller-facing reservation-transitions module (architecture.md
 * "`transitions/index.ts`"). One verb per transition. Each verb:
 *
 * 1. calls today's domain write, unchanged (money stays inside it);
 * 2. on a committed success, turns the outcome into a {@link TransitionFact};
 * 3. resolves the venue's effect policy once, plans the effects
 *    ({@link planEffects}) and runs them ({@link runEffects}).
 *
 * Every verb returns exactly the result type its domain write returns today,
 * so each route's HTTP mapping is unchanged. A domain `{ success: false }`
 * runs no effects; a `ReservationTransitionError` propagates unchanged. Verbs
 * run inside the caller's venue context (ADR-026 `runWithVenueContext`).
 */
import type {
  CreateReservationRequest,
  Reservation,
  UpdateReservationRequest,
  WalkInRequest,
} from "@mbe/types";
import type {
  CreateReservationResult,
  reservationService as ReservationServiceSingleton,
  UpdateReservationResult,
} from "../services/reservation.js";
import {
  cancelReservationWithDeposit,
  type CancelReservationResult,
} from "../services/reservation-cancellation.js";
import { recordNoShow, type RecordNoShowResult } from "../services/reservation-no-show.js";
import {
  isTimeChange,
  modifyReservation,
  type ModifyReservationResult,
  type ReservationChanges,
} from "../services/reservation-modification.js";
import {
  confirmHold,
  type ConfirmHoldInput,
  type ConfirmHoldResult,
} from "../services/confirm-hold.js";
import { planEffects, type CancelDoor, type HoldDoor, type TransitionFact } from "./plan.js";
import { runEffects, type EffectLogger } from "./run.js";
import type { CancelInitiator, EffectPorts } from "./ports.js";
import type { VenueEffectPolicySource } from "./venue-policy.js";

type ReservationWrites = Pick<
  typeof ReservationServiceSingleton,
  "update" | "updateWithConflictCheck" | "createWalkIn" | "createWithConflictCheck"
>;

/** The request-scoped logger the money paths log reconciliation detail to. */
type DomainLogger = Parameters<typeof recordNoShow>[1];

export interface ReservationTransitionsDeps {
  ports: EffectPorts;
  policy: VenueEffectPolicySource;
  reservationService: ReservationWrites;
  logger: EffectLogger;
  now?: () => Date;
}

export interface CancelOptions {
  door: CancelDoor;
  initiator: CancelInitiator;
  manageToken: string;
  reason?: string;
  note?: string;
  log: DomainLogger;
}

export interface ConfirmHoldOptions {
  door: HoldDoor;
  /** Mints the guest's manage token for the confirmed reservation (public booking only). */
  manageToken?: (reservation: Reservation) => string | undefined;
}

export interface ReservationTransitions {
  cancel(reservation: Reservation, options: CancelOptions): Promise<CancelReservationResult>;
  noShow(reservation: Reservation, log: DomainLogger): Promise<RecordNoShowResult>;
  updateByStaff(
    before: Reservation,
    patch: UpdateReservationRequest
  ): Promise<UpdateReservationResult>;
  modifyByGuest(
    reservation: Reservation,
    changes: ReservationChanges,
    manageToken: string
  ): Promise<ModifyReservationResult>;
  confirmHold(input: ConfirmHoldInput, options: ConfirmHoldOptions): Promise<ConfirmHoldResult>;
  createWalkIn(body: WalkInRequest, userId?: string): Promise<CreateReservationResult>;
  createByStaff(body: CreateReservationRequest, userId?: string): Promise<CreateReservationResult>;
  /** No-op unless the reservation is PENDING (the guard moved here from the route). */
  confirmAttendance(reservation: Reservation): Promise<void>;
}

export function createReservationTransitions(
  deps: ReservationTransitionsDeps
): ReservationTransitions {
  const { ports, policy, reservationService, logger, now = () => new Date() } = deps;

  /** Plans and runs a committed transition's effects. */
  async function settle(fact: TransitionFact, venueId: string | null | undefined): Promise<void> {
    let venuePolicy;
    try {
      venuePolicy = await policy(venueId ?? "");
    } catch (err) {
      // A policy failure may suppress effects; it can never undo the write.
      logger.error({ err, venueId, fact: fact.kind }, "Venue effect policy lookup failed");
      return;
    }
    await runEffects(planEffects(fact, venuePolicy, now()), ports, logger);
  }

  return {
    async cancel(reservation, options) {
      const result = await cancelReservationWithDeposit(
        reservation,
        options.manageToken,
        { logger: options.log },
        {
          initiator: options.initiator,
          cancellationReason: options.reason,
          cancellationNote: options.note,
        }
      );
      if (result.success) {
        await settle(
          {
            kind: "cancelled",
            door: options.door,
            reservation,
            updated: result.reservation,
            manageToken: options.manageToken,
            initiator: options.initiator,
          },
          reservation.venueId
        );
      }
      return result;
    },

    async noShow(reservation, log) {
      const result = await recordNoShow(reservation, log);
      if (result.success) {
        await settle({ kind: "no-show", reservation: result.reservation }, reservation.venueId);
      }
      return result;
    },

    async updateByStaff(before, patch) {
      const result = await reservationService.updateWithConflictCheck(before.id, patch);
      if (result.success && result.reservation) {
        await settle(
          { kind: "staff-updated", before, after: result.reservation, patch },
          before.venueId
        );
      }
      return result;
    },

    async modifyByGuest(reservation, changes, manageToken) {
      const result = await modifyReservation(reservation, changes);
      if (result.success) {
        await settle(
          {
            kind: "guest-modified",
            before: reservation,
            after: result.reservation,
            manageToken,
            timeChanged: isTimeChange(changes),
          },
          reservation.venueId
        );
      }
      return result;
    },

    async confirmHold(input, options) {
      const result = await confirmHold(input);
      if (result.success) {
        await settle(
          {
            kind: "hold-confirmed",
            door: options.door,
            reservation: result.reservation,
            manageToken: options.manageToken?.(result.reservation),
          },
          result.reservation.venueId
        );
      }
      return result;
    },

    async createWalkIn(body, userId) {
      const result = await reservationService.createWalkIn(body, userId);
      if (result.success && result.reservation) {
        await settle(
          {
            kind: "created",
            door: "walk-in",
            reservation: result.reservation,
            table: result.table,
          },
          result.reservation.venueId
        );
      }
      return result;
    },

    async createByStaff(body, userId) {
      const result = await reservationService.createWithConflictCheck(body, userId);
      if (result.success && result.reservation) {
        await settle(
          {
            kind: "created",
            door: "staff-create",
            reservation: result.reservation,
          },
          result.reservation.venueId
        );
      }
      return result;
    },

    async confirmAttendance(reservation) {
      if (reservation.status !== "PENDING") return;
      const updated = await reservationService.update(reservation.id, {
        status: "CONFIRMED",
      });
      if (updated) {
        await settle({ kind: "attendance-confirmed", reservation: updated }, reservation.venueId);
      }
    },
  };
}

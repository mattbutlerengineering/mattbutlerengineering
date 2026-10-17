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
 * run inside the caller's venue context, which comes from `venueScoped`
 * (after authorization), from an explicit `runWithVenueContext` (the public and
 * token routes: cancel-reservation, confirm-attendance, modify-reservation,
 * public-holds, public-reservations), or from `inNamedVenueContext` (the
 * UNSCOPED admin `POST /api/v1/reservations`, which runs with no context when
 * no venue is named).
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
  type ModifyHold,
  type ModifyReservationResult,
  type ReservationChanges,
} from "../services/reservation-modification.js";
import {
  confirmHold,
  type ConfirmHoldInput,
  type ConfirmHoldResult,
} from "../services/confirm-hold.js";
import { planEffects, type CancelDoor, type HoldDoor, type TransitionFact } from "./plan.js";
import type { DepositService } from "../services/deposit.js";
import { runEffects, type EffectLogger } from "./run.js";
import type { CancelInitiator, EffectPorts } from "./ports.js";
import type { ReservationEventActor } from "../services/reservation-events.js";
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
  /** The one DepositService (built over the payments port in buildApp). */
  deposits: DepositService;
  logger: EffectLogger;
  now?: () => Date;
}

export interface CancelOptions {
  door: CancelDoor;
  initiator: CancelInitiator;
  manageToken: string;
  reason?: string;
  note?: string;
  /** Who is cancelling; omitted by non-staff doors (the service defaults to the system actor). */
  actor?: ReservationEventActor;
  log: DomainLogger;
}

export interface ConfirmHoldOptions {
  door: HoldDoor;
  /** Mints the guest's manage token for the confirmed reservation (public booking only). */
  manageToken?: (reservation: Reservation) => string | undefined;
}

export interface ReservationTransitions {
  cancel(reservation: Reservation, options: CancelOptions): Promise<CancelReservationResult>;
  noShow(
    reservation: Reservation,
    log: DomainLogger,
    actor?: ReservationEventActor
  ): Promise<RecordNoShowResult>;
  updateByStaff(
    before: Reservation,
    patch: UpdateReservationRequest,
    actor?: ReservationEventActor
  ): Promise<UpdateReservationResult>;
  modifyByGuest(
    reservation: Reservation,
    changes: ReservationChanges,
    manageToken: string,
    hold?: ModifyHold,
    actor?: ReservationEventActor
  ): Promise<ModifyReservationResult>;
  confirmHold(input: ConfirmHoldInput, options: ConfirmHoldOptions): Promise<ConfirmHoldResult>;
  createWalkIn(
    body: WalkInRequest,
    userId?: string,
    actor?: ReservationEventActor
  ): Promise<CreateReservationResult>;
  createByStaff(
    body: CreateReservationRequest,
    userId?: string,
    actor?: ReservationEventActor
  ): Promise<CreateReservationResult>;
  /** No-op unless the reservation is PENDING (the guard moved here from the route). */
  confirmAttendance(reservation: Reservation, actor?: ReservationEventActor): Promise<void>;
}

export function createReservationTransitions(
  deps: ReservationTransitionsDeps
): ReservationTransitions {
  const { ports, policy, reservationService, deposits, logger, now = () => new Date() } = deps;

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
        { logger: options.log, deposits },
        {
          initiator: options.initiator,
          cancellationReason: options.reason,
          cancellationNote: options.note,
          actor: options.actor,
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

    async noShow(reservation, log, actor) {
      const result = await recordNoShow(reservation, log, deposits, actor);
      if (result.success) {
        await settle({ kind: "no-show", reservation: result.reservation }, reservation.venueId);
      }
      return result;
    },

    async updateByStaff(before, patch, actor) {
      const result = await reservationService.updateWithConflictCheck(before.id, patch, actor);
      if (result.success && result.reservation) {
        await settle(
          { kind: "staff-updated", before, after: result.reservation, patch },
          before.venueId
        );
      }
      return result;
    },

    async modifyByGuest(reservation, changes, manageToken, hold, actor) {
      const result = await modifyReservation(reservation, changes, deposits, hold, actor);
      if (result.success) {
        await settle(
          {
            kind: "guest-modified",
            before: reservation,
            after: result.reservation,
            manageToken,
            timeChanged: hold !== undefined || isTimeChange(changes),
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

    async createWalkIn(body, userId, actor) {
      const result = await reservationService.createWalkIn(body, userId, actor);
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

    async createByStaff(body, userId, actor) {
      const result = await reservationService.createWithConflictCheck(body, userId, actor);
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

    async confirmAttendance(reservation, actor) {
      if (reservation.status !== "PENDING") return;
      const updated = await reservationService.update(
        reservation.id,
        { status: "CONFIRMED" },
        actor
      );
      if (updated) {
        await settle({ kind: "attendance-confirmed", reservation: updated }, reservation.venueId);
      }
    },
  };
}

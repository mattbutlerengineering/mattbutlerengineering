import { describe, it, expect } from "vitest";
import type { Reservation, Table } from "@mbe/types";
import { planEffects, type TransitionFact } from "./plan.js";
import type { PlannedEffect } from "./ports.js";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2030-06-01T12:00:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();
const LIVE = { outbound: "live" } as const;
const SUPPRESSED = { outbound: "suppressed" } as const;

function res(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    venueId: "venue-1",
    status: "CONFIRMED",
    date: at(72).slice(0, 10),
    startTime: at(72),
    endTime: at(74),
    partySize: 2,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    ...overrides,
  } as Reservation;
}

const table = { id: "table-1", venueId: "venue-1" } as Table;
const payload = { reservationId: "res-1", venueId: "venue-1" };

/** Compact view: port + what + timing/onFailure. */
function view(planned: PlannedEffect[]) {
  return planned.map(({ effect, timing, onFailure }) => {
    const what =
      effect.port === "events"
        ? effect.event.type
        : effect.port === "messaging"
          ? effect.message.kind
          : `${effect.op.op} ${effect.op.jobId}${"delayMs" in effect.op ? ` @${effect.op.delayMs / HOUR}h` : ""}`;
    return `${effect.port}:${what} [${timing}/${onFailure}]`;
  });
}

const plan = (fact: TransitionFact, policy: { outbound: "live" | "suppressed" } = LIVE) =>
  planEffects(fact, policy, NOW);

describe("planEffects — the effects table", () => {
  describe("cancelled", () => {
    const fact = (door: "staff-patch" | "staff-delete" | "guest-manage"): TransitionFact => ({
      kind: "cancelled",
      door,
      reservation: res(),
      updated: res({ status: "CANCELLED" }),
      manageToken: "tok",
      initiator: door === "guest-manage" ? "guest" : "staff",
    });

    it.each(["staff-patch", "staff-delete", "guest-manage"] as const)(
      "%s: cancel both reminders, cancelled email (propagates), reservation:cancelled",
      (door) => {
        expect(view(plan(fact(door)))).toEqual([
          "jobs:cancel booking-reminder:res-1 [await/log]",
          "jobs:cancel day-of-reminder:res-1 [await/log]",
          "messaging:booking-cancelled [await/propagate]",
          "events:reservation:cancelled [await/log]",
        ]);
      }
    );

    it("tells the guest about the pre-cancel reservation and live clients about the committed row", () => {
      const planned = plan(fact("staff-patch"));
      const msg = planned.find((p) => p.effect.port === "messaging")!.effect;
      const evt = planned.find((p) => p.effect.port === "events")!.effect;
      expect(msg).toMatchObject({
        message: {
          kind: "booking-cancelled",
          initiator: "staff",
          manageToken: "tok",
        },
      });
      expect(msg.port === "messaging" && msg.message.reservation.status).toBe("CONFIRMED");
      expect(evt).toMatchObject({
        event: {
          type: "reservation:cancelled",
          venueId: "venue-1",
          data: { status: "CANCELLED" },
        },
      });
    });
  });

  it("no-show: reservation:updated only (D6) — no message, no job", () => {
    expect(view(plan({ kind: "no-show", reservation: res({ status: "NO_SHOW" }) }))).toEqual([
      "events:reservation:updated [await/log]",
    ]);
  });

  describe("staff-updated", () => {
    const fact = (
      patch: Record<string, unknown>,
      after: Partial<Reservation> = {}
    ): TransitionFact => ({
      kind: "staff-updated",
      before: res(),
      after: res(after),
      patch,
    });

    it("status → COMPLETED: post-visit thank-you in the background, reservation:updated (D7)", () => {
      expect(view(plan(fact({ status: "COMPLETED" }, { status: "COMPLETED" })))).toEqual([
        "messaging:post-visit-thank-you [background/log]",
        "events:reservation:updated [await/log]",
      ]);
    });

    it("time change: replace-if-present both reminders at the new time, never schedule (D8)", () => {
      const planned = plan(fact({ startTime: at(96) }, { startTime: at(96) }));
      expect(view(planned)).toEqual([
        "jobs:replace-if-present booking-reminder:res-1 @72h [background/log]",
        "jobs:replace-if-present day-of-reminder:res-1 @94h [background/log]",
        "events:reservation:updated [await/log]",
      ]);
      expect(planned[0]!.effect).toMatchObject({
        op: { jobType: "booking-reminder", payload },
      });
    });

    it("time change into the next 24h: day-of replaced, the stale day-before reminder cancelled", () => {
      expect(view(plan(fact({ startTime: at(5) }, { startTime: at(5) })))).toEqual([
        "jobs:cancel booking-reminder:res-1 [background/log]",
        "jobs:replace-if-present day-of-reminder:res-1 @3h [background/log]",
        "events:reservation:updated [await/log]",
      ]);
    });

    it("time change with no venue plans no job", () => {
      expect(view(plan(fact({ date: at(96).slice(0, 10) }, { venueId: null })))).toEqual([
        "events:reservation:updated [await/log]",
      ]);
    });

    it("any other change: reservation:updated only", () => {
      expect(view(plan(fact({ notes: "window" }, { notes: "window" })))).toEqual([
        "events:reservation:updated [await/log]",
      ]);
    });

    it("status and time together compose into ONE reservation:updated", () => {
      const planned = plan(
        fact({ status: "COMPLETED", startTime: at(96) }, { status: "COMPLETED", startTime: at(96) })
      );
      expect(view(planned).filter((v) => v.startsWith("events:"))).toEqual([
        "events:reservation:updated [await/log]",
      ]);
      expect(view(planned)).toContain("messaging:post-visit-thank-you [background/log]");
    });
  });

  describe("guest-modified", () => {
    const fact = (timeChanged: boolean, after: Partial<Reservation> = {}): TransitionFact => ({
      kind: "guest-modified",
      before: res(),
      after: res(after),
      manageToken: "tok",
      timeChanged,
    });

    it("time change: one background chain — cancel ×2, confirmation, reschedule — then the modified email", () => {
      expect(view(plan(fact(true, { startTime: at(96) })))).toEqual([
        "jobs:cancel booking-reminder:res-1 [background/log]",
        "jobs:cancel day-of-reminder:res-1 [background/log]",
        "messaging:booking-confirmation [background/propagate]",
        "jobs:schedule booking-reminder:res-1 @72h [background/propagate]",
        "jobs:schedule day-of-reminder:res-1 @94h [background/propagate]",
        "messaging:booking-modified [await/log]",
        "events:reservation:updated [await/log]",
      ]);
    });

    it("no time change: only the modified email and reservation:updated", () => {
      expect(view(plan(fact(false)))).toEqual([
        "messaging:booking-modified [await/log]",
        "events:reservation:updated [await/log]",
      ]);
    });
  });

  describe("hold-confirmed", () => {
    const fact = (
      door: "public-booking" | "staff-hold" | "public-hold",
      overrides: Partial<Reservation> = {}
    ): TransitionFact => ({
      kind: "hold-confirmed",
      door,
      reservation: res(overrides),
      manageToken: door === "public-booking" ? "tok" : undefined,
    });

    it("public-booking: confirmation then reminders in one background chain, hold:confirmed (D5)", () => {
      expect(view(plan(fact("public-booking")))).toEqual([
        "messaging:booking-confirmation [background/propagate]",
        "jobs:schedule booking-reminder:res-1 @48h [background/propagate]",
        "jobs:schedule day-of-reminder:res-1 @70h [background/propagate]",
        "events:hold:confirmed [await/log]",
      ]);
    });

    it("public-booking starting within 24h schedules only the day-of reminder", () => {
      expect(view(plan(fact("public-booking", { startTime: at(5) })))).toEqual([
        "messaging:booking-confirmation [background/propagate]",
        "jobs:schedule day-of-reminder:res-1 @3h [background/propagate]",
        "events:hold:confirmed [await/log]",
      ]);
    });

    it("public-booking whose start has passed schedules no reminder", () => {
      expect(view(plan(fact("public-booking", { startTime: at(-1) })))).toEqual([
        "messaging:booking-confirmation [background/propagate]",
        "events:hold:confirmed [await/log]",
      ]);
    });

    it.each(["staff-hold", "public-hold"] as const)(
      "%s: hold:confirmed only — no message, no job (D4 kept)",
      (door) => {
        expect(view(plan(fact(door)))).toEqual(["events:hold:confirmed [await/log]"]);
      }
    );
  });

  describe("created", () => {
    it("walk-in: reservation:created then table:updated (D3)", () => {
      const planned = plan({
        kind: "created",
        door: "walk-in",
        reservation: res(),
        table,
      });
      expect(view(planned)).toEqual([
        "events:reservation:created [await/log]",
        "events:table:updated [await/log]",
      ]);
      expect(planned[1]!.effect).toMatchObject({
        event: { venueId: "venue-1", data: { id: "table-1" } },
      });
    });

    it("staff-create: reservation:created only — no message, no job (D2 kept)", () => {
      expect(view(plan({ kind: "created", door: "staff-create", reservation: res() }))).toEqual([
        "events:reservation:created [await/log]",
      ]);
    });
  });

  it("attendance-confirmed: reservation:updated", () => {
    expect(view(plan({ kind: "attendance-confirmed", reservation: res() }))).toEqual([
      "events:reservation:updated [await/log]",
    ]);
  });

  describe("venue policy", () => {
    const facts: TransitionFact[] = [
      {
        kind: "cancelled",
        door: "guest-manage",
        reservation: res(),
        updated: res({ status: "CANCELLED" }),
        manageToken: "tok",
        initiator: "guest",
      },
      {
        kind: "staff-updated",
        before: res(),
        after: res(),
        patch: { status: "COMPLETED", startTime: at(96) },
      },
      {
        kind: "guest-modified",
        before: res(),
        after: res(),
        manageToken: "tok",
        timeChanged: true,
      },
      {
        kind: "hold-confirmed",
        door: "public-booking",
        reservation: res(),
        manageToken: "tok",
      },
    ];

    it.each(facts.map((f) => [f.kind, f] as const))(
      "suppressed drops every message and job but keeps live events (%s)",
      (_kind, fact) => {
        const live = plan(fact);
        const suppressed = plan(fact, SUPPRESSED);
        expect(suppressed.every((p) => p.effect.port === "events")).toBe(true);
        expect(suppressed).toEqual(live.filter((p) => p.effect.port === "events"));
        expect(suppressed.length).toBeGreaterThan(0);
      }
    );
  });

  it("never plans a payments effect", () => {
    const ports = new Set(
      [
        plan({ kind: "no-show", reservation: res() }),
        plan({
          kind: "cancelled",
          door: "staff-patch",
          reservation: res(),
          updated: res(),
          manageToken: "t",
          initiator: "staff",
        }),
      ]
        .flat()
        .map((p) => p.effect.port)
    );
    expect([...ports].sort()).toEqual(["events", "jobs", "messaging"]);
  });
});

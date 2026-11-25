import { describe, expect, it } from "vitest";
import type { FastifyReply } from "fastify";
import {
  CLOSURE_REFUSAL_COPY,
  CONFIG_REFUSAL_COPY,
  REVERT_REFUSAL_COPY,
  sendAvailabilityRefusal,
  type RefusalCopy,
} from "./availability-refusal.js";

function capture(refusal: Parameters<typeof sendAvailabilityRefusal>[1], copy: RefusalCopy) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const reply = {
    code(n: number) {
      status = n;
      return this;
    },
    send(b: Record<string, unknown>) {
      body = b;
      return this;
    },
  } as unknown as FastifyReply;
  sendAvailabilityRefusal(reply, refusal, copy);
  return { status, body };
}

const winningChange = null;
const issues = [{ path: "x", code: "c", message: "m" }];
const stranded = [
  { id: "r1", startTime: "2026-11-07T06:30:00.000Z", partySize: 2, reason: "closed" },
];

describe("sendAvailabilityRefusal", () => {
  it.each([
    ["not_found", { kind: "not_found" }, 404, undefined, "Venue not found"],
    ["forbidden", { kind: "forbidden" }, 403, undefined, undefined],
    ["too_long", { kind: "too_long" }, 400, undefined, undefined],
    [
      "version_conflict",
      { kind: "version_conflict", winningChange, currentVersion: 4 },
      409,
      "version-conflict",
      "Availability changed since you loaded it.",
    ],
    [
      "closure_exists",
      { kind: "closure_exists" },
      409,
      "closure-exists",
      "This closure was already saved; reopen it or use a new rule id.",
    ],
    [
      "key_reused",
      { kind: "key_reused" },
      409,
      "idempotency-key-reused",
      "This Idempotency-Key was already used for a different closure.",
    ],
    [
      "decision_required",
      { kind: "decision_required", groupKeys: ["g"] },
      422,
      "decision-required",
      "Every affected group needs a choice (and keeping silently needs a confirmation).",
    ],
    [
      "invalid_decision",
      { kind: "invalid_decision", groupKeys: ["g"] },
      422,
      "invalid-decision",
      "A decision names an unknown or repeated group, or moves a closed day.",
    ],
    [
      "move_unavailable",
      { kind: "move_unavailable", reservationIds: ["r"] },
      422,
      "move-unavailable",
      "Some bookings have no open time to move to; choose another outcome.",
    ],
    [
      "timeout",
      { kind: "timeout" },
      503,
      "preview-timeout",
      "The preview took too long; try again.",
    ],
  ] as const)(
    "%s: same status, code and detail on every route",
    (_n, refusal, status, code, detail) => {
      for (const copy of [CLOSURE_REFUSAL_COPY, CONFIG_REFUSAL_COPY, REVERT_REFUSAL_COPY]) {
        const out = capture(refusal as never, copy);
        expect(out.status).toBe(status);
        if (code) expect(out.body.code).toBe(code);
        if (detail) expect(out.body.detail).toBe(detail);
      }
    }
  );

  it("keeps currentVersion and changesSince on a version conflict", () => {
    const changesSince = { total: 2, changes: [] };
    const { body } = capture(
      { kind: "version_conflict", winningChange, currentVersion: 4, changesSince } as never,
      REVERT_REFUSAL_COPY
    );
    expect(body).toMatchObject({ currentVersion: 4, changesSince });
  });

  it.each([
    ["closures", CLOSURE_REFUSAL_COPY, "The closure is not valid."],
    ["config", CONFIG_REFUSAL_COPY, "The availability config is not valid."],
    [
      "revert",
      REVERT_REFUSAL_COPY,
      "The change can no longer be undone against the current availability.",
    ],
  ])("invalid on %s keeps its own wording", (_n, copy, detail) => {
    const out = capture({ kind: "invalid", issues } as never, copy);
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ code: "invalid-config", detail, issues });
  });

  it.each([
    [
      "config",
      CONFIG_REFUSAL_COPY,
      "This change affects existing bookings; save it through a closure so each one gets a decision.",
    ],
    ["revert", REVERT_REFUSAL_COPY, "Undoing this would leave existing bookings without service."],
  ])("stranded on %s keeps its own wording", (_n, copy, detail) => {
    const out = capture({ kind: "stranded", reservations: stranded } as never, copy);
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ code: "stranded-bookings", detail });
  });
});

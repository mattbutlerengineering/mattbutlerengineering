import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ApiClientError } from "@mbe/api-client";
import type { ClosureImpact, DateRule } from "@mbe/types";
import { useDecisionsSession, type DecisionsSend } from "./use-decisions-session.js";

const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  new ApiClientError(
    { type: "about:blank", title: code, status, detail: "Server said.", code, ...extra } as never,
    "POST",
    "closures"
  );

const booking = (id: string) => ({
  id,
  startTime: "2026-12-25T03:30:00.000Z",
  endTime: "2026-12-25T04:30:00.000Z",
  partySize: 2,
  guestName: id,
  deposit: null,
  runsIntoClosure: false,
});

const impactOf = (...groupKeys: string[]): ClosureImpact =>
  ({
    groups: groupKeys.map((groupKey) => ({
      groupKey,
      date: "2026-12-24",
      kind: "closed",
      covers: 2,
      depositsHeld: 0,
      reservations: [booking(`r-${groupKey}`)],
    })),
  }) as never;

const NO_GROUPS = impactOf();
const ONE_GROUP = impactOf("g1");

const REFUSALS = {
  "groups-changed": () => problem(422, "decision-required", { groupKeys: ["g1"] }),
  "move-unavailable": () => problem(422, "move-unavailable", { reservationIds: ["r-g1"] }),
  "version-conflict": () => problem(409, "version-conflict"),
  "closure-exists": () => problem(409, "closure-exists"),
  other: () => problem(400, "invalid-config"),
  unknown: () => new TypeError("Failed to fetch"),
} as const;

function setup(
  options: {
    impact?: ClosureImpact[];
    firstRuleId?: string;
    rules?: DateRule[];
    send?: ReturnType<typeof vi.fn>;
    attemptOf?: () => { ruleIds: readonly string[]; dates: readonly string[] };
  } = {}
) {
  const send = options.send ?? vi.fn().mockResolvedValue("out");
  const refetch = vi.fn().mockResolvedValue(undefined);
  const onSaved = vi.fn();
  const onVersionConflict = vi.fn();
  const reload = vi.fn();
  const onLeave = vi.fn();
  const hook = renderHook(() =>
    useDecisionsSession<string>({
      rules: options.rules ?? [],
      impact: { data: options.impact, refetch },
      firstRuleId: options.firstRuleId,
      attemptOf: options.attemptOf,
      send: send as (a: DecisionsSend) => Promise<string>,
      onSaved,
      onVersionConflict,
      reload,
      onLeave,
    })
  );
  return { hook, send, refetch, onSaved, onVersionConflict, reload, onLeave };
}

const choose = (h: ReturnType<typeof setup>) =>
  act(() => h.hook.result.current.setChoice("g1", { action: "cancel", acknowledged: false }));
const submit = (h: ReturnType<typeof setup>) =>
  act(async () => {
    await h.hook.result.current.submit();
  });

describe("useDecisionsSession entry states", () => {
  it("starts editing while there is no impact", () => {
    expect(setup().hook.result.current.state.kind).toBe("editing");
  });
  it("starts editing when the impact has no groups", () => {
    expect(setup({ impact: [NO_GROUPS] }).hook.result.current.state.kind).toBe("editing");
  });
  it("is deciding once the impact has groups", () => {
    expect(setup({ impact: [ONE_GROUP] }).hook.result.current.state.kind).toBe("deciding");
  });
  it("init(firstRuleId) goes straight into deciding, under that rule id", () => {
    const h = setup({ firstRuleId: "rule-1" });
    expect(h.hook.result.current.state.kind).toBe("deciding");
    expect(h.hook.result.current.attempts.ruleId).toBe("rule-1");
  });
});

describe("useDecisionsSession submit", () => {
  it("sends straight from editing when there is nothing to decide, then is saved", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    await submit(h);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![0].decisions).toEqual([[]]);
    expect(h.onSaved).toHaveBeenCalledWith("out");
    expect(h.hook.result.current.state.kind).toBe("saved");
  });

  it("does not send while a group has no choice", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    await submit(h);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.hook.result.current.state.kind).toBe("deciding");
  });

  it("sends the chosen decisions, one list per impact", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    choose(h);
    await submit(h);
    expect(h.send.mock.calls[0]![0].decisions).toEqual([
      [{ groupKey: "g1", action: "cancel", reservationIds: ["r-g1"] }],
    ]);
  });

  it("holds in sending while the save is in flight", async () => {
    let finish!: (v: string) => void;
    const send = vi.fn().mockReturnValue(new Promise<string>((r) => (finish = r)));
    const h = setup({ impact: [NO_GROUPS], send });
    let pending!: Promise<void>;
    act(() => {
      pending = h.hook.result.current.submit();
    });
    expect(h.hook.result.current.state.kind).toBe("sending");
    await act(async () => {
      finish("done");
      await pending;
    });
    expect(h.hook.result.current.state.kind).toBe("saved");
  });
});

describe("useDecisionsSession refusals (kind x next state x ids)", () => {
  it("groups-changed: back to deciding, choices cleared, impact refetched, not a failed attempt", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    const { ruleId, idempotencyKey } = h.hook.result.current.attempts;
    choose(h);
    h.send.mockRejectedValueOnce(REFUSALS["groups-changed"]());
    await submit(h);
    expect(h.hook.result.current.state.kind).toBe("deciding");
    expect(h.hook.result.current.choices).toEqual({});
    expect(h.refetch).toHaveBeenCalled();
    expect(h.hook.result.current.failure).toContain("changed");
    // Not failed: an unchanged request keeps its ids even after a changed choice.
    choose(h);
    expect(h.hook.result.current.attempts.ruleId).toBe(ruleId);
    expect(h.hook.result.current.attempts.idempotencyKey).toBe(idempotencyKey);
  });

  it("move-unavailable: back to deciding, those choices trimmed, refetched, marked failed", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    choose(h);
    h.send.mockRejectedValueOnce(REFUSALS["move-unavailable"]());
    await submit(h);
    expect(h.hook.result.current.state.kind).toBe("deciding");
    expect(h.hook.result.current.choices).toEqual({});
    expect(h.refetch).toHaveBeenCalled();
    expect(h.hook.result.current.failure).toBeTruthy();
  });

  it("version-conflict: refused with the winner, flow reaction called", async () => {
    const winningChange = {
      id: "c1",
      actorId: "auth0|ana",
      at: "2026-10-25T22:42:00.000Z",
      kind: "config",
      summary: "Closed",
    };
    const h = setup({ impact: [ONE_GROUP] });
    choose(h);
    h.send.mockRejectedValueOnce(problem(409, "version-conflict", { winningChange }));
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "refused", refusal: "version-conflict" });
    expect(h.hook.result.current.winner).toEqual(winningChange);
    expect(h.onVersionConflict).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "version-conflict" })
    );
  });

  it("closure-exists: settled as maybeSaved until the rule shows in the config, then earlier", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    h.send.mockRejectedValueOnce(REFUSALS["closure-exists"]());
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "settled", reason: "maybeSaved" });

    const withRule = setup({ impact: [NO_GROUPS], rules: [] });
    const { ruleId } = withRule.hook.result.current.attempts;
    withRule.hook.unmount();
    const earlier = setup({
      impact: [NO_GROUPS],
      firstRuleId: ruleId,
      rules: [{ id: ruleId } as DateRule],
    });
    earlier.send.mockRejectedValueOnce(REFUSALS["closure-exists"]());
    await submit(earlier);
    expect(earlier.hook.result.current.state).toEqual({ kind: "settled", reason: "earlier" });
  });

  it("unknown outcome: settled as maybeSaved", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    h.send.mockRejectedValueOnce(REFUSALS.unknown());
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "settled", reason: "maybeSaved" });
  });

  it("other refusal: refused(other) with the server's detail, ids kept", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    const before = { ...h.hook.result.current.attempts };
    h.send.mockRejectedValueOnce(REFUSALS.other());
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "refused", refusal: "other" });
    expect(h.hook.result.current.failure).toBe("Server said.");
    expect(h.hook.result.current.attempts.ruleId).toBe(before.ruleId);
    expect(h.hook.result.current.attempts.idempotencyKey).toBe(before.idempotencyKey);
  });
});

describe("useDecisionsSession attempt ids", () => {
  it("the same request after a failure keeps its ids and sends them again", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    h.send.mockRejectedValueOnce(REFUSALS.other());
    await submit(h);
    await submit(h);
    const [first, second] = h.send.mock.calls.map((c) => c[0]);
    expect(second.ruleId).toBe(first.ruleId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("a changed request after a failure restarts both ids and leaves refused for editing", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    const before = { ...h.hook.result.current.attempts };
    h.send.mockRejectedValueOnce(REFUSALS.other());
    await submit(h);
    act(() => h.hook.result.current.edited({ a: 1 }, { a: 2 }));
    expect(h.hook.result.current.state.kind).toBe("editing");
    expect(h.hook.result.current.attempts.ruleId).not.toBe(before.ruleId);
    expect(h.hook.result.current.attempts.idempotencyKey).not.toBe(before.idempotencyKey);
  });

  it("an edit that changes nothing keeps the refusal and the ids", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    h.send.mockRejectedValueOnce(REFUSALS.other());
    await submit(h);
    act(() => h.hook.result.current.edited({ a: 1 }, { a: 1 }));
    expect(h.hook.result.current.state.kind).toBe("refused");
  });

  it("derives per-row ids from the key: stable within an attempt, new after a restart", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    const seen: string[] = [];
    h.send.mockImplementation(async (a: { ruleIdFor: (k: string) => string }) => {
      seen.push(a.ruleIdFor("row-1"), a.ruleIdFor("row-1"), a.ruleIdFor("row-2"));
      throw REFUSALS.other();
    });
    await submit(h);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[2]).not.toBe(seen[0]);
    act(() => h.hook.result.current.edited(1, 2));
    await submit(h);
    expect(seen[3]).not.toBe(seen[0]);
  });

  it("per-row ids stay stable after a restart, and across a retry of the same request", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    const rounds: string[][] = [];
    h.send.mockImplementation(async (a: { ruleIdFor: (k: string) => string }) => {
      rounds.push([a.ruleIdFor("row-1"), a.ruleIdFor("row-2"), a.ruleIdFor("row-1")]);
      throw REFUSALS.other();
    });
    await submit(h);
    act(() => h.hook.result.current.edited(1, 2));
    await submit(h);
    await submit(h);
    const [before, afterRestart, retry] = rounds;
    expect(afterRestart![0]).toBe(afterRestart![2]);
    expect(afterRestart![0]).not.toBe(afterRestart![1]);
    expect(afterRestart![0]).not.toBe(before![0]);
    expect(retry).toEqual(afterRestart);
  });

  it("works without an idempotency key (Tonight sends none): the key is still offered, the flow may ignore it", async () => {
    const h = setup({ firstRuleId: "rule-1", impact: [ONE_GROUP] });
    choose(h);
    await submit(h);
    expect(h.send.mock.calls[0]![0].ruleId).toBe("rule-1");
  });
});

describe("useDecisionsSession after a save with no definite answer", () => {
  it("still sends again: the same request replays the truth, a changed one is a new attempt", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    choose(h);
    h.send.mockRejectedValueOnce(REFUSALS.unknown());
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "settled", reason: "maybeSaved" });
    const firstKey = h.send.mock.calls[0]![0].idempotencyKey;
    await submit(h);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1]![0].idempotencyKey).toBe(firstKey);
  });

  it("does not send once an attempt shows in the config", async () => {
    const h = setup({
      impact: [NO_GROUPS],
      firstRuleId: "rule-1",
      rules: [{ id: "rule-1" } as DateRule],
    });
    h.send.mockRejectedValueOnce(REFUSALS.other());
    await submit(h);
    expect(h.hook.result.current.state).toEqual({ kind: "settled", reason: "earlier" });
    await submit(h);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});

describe("useDecisionsSession a flow that previews and saves in one go", () => {
  it("sends the impacts it is handed, not the ones of the last render", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    await act(async () => {
      await h.hook.result.current.submit([NO_GROUPS]);
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![0].decisions).toEqual([[]]);
    expect(h.hook.result.current.state.kind).toBe("saved");
  });

  it("records the rule ids and dates the flow sends, so an earlier attempt can be named", async () => {
    const send = vi.fn().mockRejectedValue(REFUSALS.other());
    const rules = [{ id: "rule-a" } as DateRule];
    const h = setup({
      impact: [NO_GROUPS],
      send,
      rules,
      attemptOf: () => ({ ruleIds: ["rule-a", "rule-b"], dates: ["2026-12-24", "2026-12-25"] }),
    });
    await submit(h);
    expect(h.hook.result.current.attempts.earlier?.dates).toEqual(["2026-12-24", "2026-12-25"]);
  });
});

describe("useDecisionsSession reset", () => {
  it("clears choices, failure, winner and a refusal, keeping the attempt ids", async () => {
    const h = setup({ impact: [ONE_GROUP] });
    const { ruleId } = h.hook.result.current.attempts;
    choose(h);
    h.send.mockRejectedValueOnce(problem(409, "version-conflict", { winningChange: null }));
    await submit(h);
    expect(h.hook.result.current.state.kind).toBe("refused");
    act(() => h.hook.result.current.reset());
    expect(h.hook.result.current.state.kind).toBe("deciding");
    expect(h.hook.result.current.choices).toEqual({});
    expect(h.hook.result.current.failure).toBeNull();
    expect(h.hook.result.current.winner).toBeNull();
    expect(h.hook.result.current.attempts.ruleId).toBe(ruleId);
  });
});

describe("useDecisionsSession leave", () => {
  it("leaves at once when nothing was sent, with no reload", () => {
    const h = setup({ impact: [NO_GROUPS] });
    act(() => h.hook.result.current.leave());
    expect(h.onLeave).toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });
  it("reloads on leaving after a save", async () => {
    const h = setup({ impact: [NO_GROUPS] });
    await submit(h);
    act(() => h.hook.result.current.leave());
    expect(h.reload).toHaveBeenCalled();
    expect(h.onLeave).toHaveBeenCalled();
  });
  it("does not leave while sending", () => {
    const send = vi.fn().mockReturnValue(new Promise(() => undefined));
    const h = setup({ impact: [NO_GROUPS], send });
    act(() => void h.hook.result.current.submit());
    act(() => h.hook.result.current.leave());
    expect(h.onLeave).not.toHaveBeenCalled();
  });
});

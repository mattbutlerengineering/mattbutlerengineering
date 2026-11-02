import { describe, it, expect, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { closureReadToken } from "./gen-agent-closure-support.js";

/**
 * #8134, per tool: every write tool that states "nothing was written" is checked
 * with the call that refuses before any write request leaves. The refusal must not
 * spend the confirmed action (a second call is not "already executed") and the
 * write endpoint must never have been called. Tools that never state it are not
 * listed: a thrown error or an unmarked result keeps the action spent.
 */

const ALREADY = { error: "This confirmed action has already been executed." };

function createMockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

/** An api whose every endpoint is a vi.fn created on first use, so a case arranges only what it reads. */
function lazyApi() {
  const groups = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  return new Proxy(
    {},
    {
      get(_target, group: string) {
        if (!groups.has(group)) {
          const fns: Record<string, ReturnType<typeof vi.fn>> = {};
          groups.set(
            group,
            new Proxy(fns, {
              get(target, name: string) {
                target[name] ??= vi.fn();
                return target[name];
              },
            })
          );
        }
        return groups.get(group);
      },
    }
  ) as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
}

function problem(status: number, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused.", ...extra },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

function gated(
  api: unknown,
  toolName: string,
  input: Record<string, unknown>,
  venueId: string | null = "v1"
) {
  const tools = createAgentTools(createMockLogger(), api as never, {
    ...(venueId ? { venueId } : {}),
    confirmedAction: { actionId: "call-1", toolName, toolInput: input },
  });
  return () => tools[toolName]!.execute!(input as never, toolCtx) as Promise<unknown>;
}

const EMPTY_CONFIG = {
  version: 3,
  source: "rows",
  config: {
    schedules: [],
    venueServices: [],
    scheduleServices: [],
    assignments: [],
    dateRules: [],
  },
};

interface Case {
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly arrange: (api: ReturnType<typeof lazyApi>) => void;
  /** The endpoint(s) that would write. */
  readonly writes: (api: ReturnType<typeof lazyApi>) => ReturnType<typeof vi.fn>[];
  /** null: no venue is selected. */
  readonly venueId?: null;
}

const CASES: readonly Case[] = [
  {
    tool: "create_reservation",
    input: {
      guestName: "Smith",
      date: "2026-05-18",
      startTime: "late",
      endTime: "21:00",
      partySize: 4,
      tableId: "t1",
    },
    arrange: () => undefined,
    writes: (api) => [api.reservations!.create!],
  },
  {
    tool: "cancel_reservation",
    input: {},
    arrange: () => undefined,
    writes: (api) => [api.reservations!.cancel!, api.reservations!.cancelWithReason!],
  },
  {
    tool: "seat_walk_in",
    input: { partySize: 2 },
    arrange: () => undefined,
    writes: (api) => [api.reservations!.walkIn!],
  },
  {
    tool: "update_table_status",
    input: { table: "3", status: "DIRTY" },
    arrange: (api) => api.tables!.list!.mockResolvedValue({ data: [] }),
    writes: (api) => [api.tables!.updateStatus!],
  },
  {
    tool: "change_tonight_availability",
    input: { change: "pause_online" },
    arrange: (api) => api.availability!.getConfig!.mockRejectedValue(new Error("down")),
    writes: (api) => [api.availability!.setTonight!],
  },
  {
    tool: "end_tonight_change",
    input: { change: "pause_online" },
    arrange: (api) => api.availability!.getConfig!.mockResolvedValue(EMPTY_CONFIG),
    writes: (api) => [api.availability!.endTonight!],
  },
  {
    tool: "undo_availability_change",
    input: { summary: "Paused online booking" },
    arrange: (api) =>
      api.availability!.listChanges!.mockResolvedValue({ items: [], undoable: null }),
    writes: (api) => [api.availability!.revertChange!],
  },
  {
    tool: "close_dates",
    input: { scope: "whole_venue", date: "nope" },
    arrange: () => undefined,
    writes: (api) => [api.availability!.createClosure!],
  },
  {
    tool: "set_special_hours",
    input: {
      date: "nope",
      service: "Dinner",
      opensAt: "17:00",
      lastSeating: "21:00",
      closesAt: "23:00",
    },
    arrange: () => undefined,
    writes: (api) => [api.availability!.createClosure!],
  },
  {
    tool: "reopen_closure",
    input: {
      from: "nope",
      to: "nope",
      scope: "whole_venue",
      tellCancelledGuests: false,
      readAs: "x",
    },
    arrange: () => undefined,
    writes: (api) => [api.availability!.reopenClosure!],
  },
  {
    tool: "update_guest",
    input: { guest: "Ann", name: "Anna" },
    arrange: (api) => api.guests!.search!.mockResolvedValue({ data: [] }),
    writes: (api) => [api.guests!.update!],
  },
  {
    tool: "add_guest_note",
    input: { guest: "Ann", text: "Likes the window" },
    arrange: (api) => api.guests!.search!.mockResolvedValue({ data: [] }),
    writes: (api) => [api.guests!.addNote!],
  },
  {
    tool: "send_win_back",
    input: { guest: "Ann" },
    arrange: (api) => api.guests!.getLapsing!.mockResolvedValue([]),
    writes: (api) => [api.guests!.sendWinBack!],
  },
  {
    tool: "add_to_waitlist",
    input: { guestName: "Ann", partySize: 2, guestPhone: "555-0100" },
    arrange: () => undefined,
    writes: (api) => [api.waitlist!.create!],
    venueId: null,
  },
  {
    tool: "notify_waitlist_party",
    input: { guestName: "Ann" },
    arrange: (api) => api.waitlist!.list!.mockResolvedValue([]),
    writes: (api) => [api.waitlist!.notify!],
  },
  {
    tool: "seat_waitlist_party",
    input: { guestName: "Ann", table: "3" },
    arrange: (api) => api.waitlist!.list!.mockResolvedValue([]),
    writes: (api) => [api.reservations!.walkIn!, api.waitlist!.seat!],
  },
  {
    tool: "remove_from_waitlist",
    input: { guestName: "Ann" },
    arrange: (api) => api.waitlist!.list!.mockResolvedValue([]),
    writes: (api) => [api.waitlist!.cancel!],
  },
  {
    tool: "set_menu_item_availability",
    input: { menu: "Lunch", item: "Soup", availability: "sold_out" },
    arrange: (api) => api.menus!.list!.mockResolvedValue([]),
    writes: (api) => [api.menus!.updateItem!],
  },
  {
    tool: "update_menu_item",
    input: { menu: "Lunch", item: "Soup", price: "5.00" },
    arrange: (api) => api.menus!.list!.mockResolvedValue([]),
    writes: (api) => [api.menus!.updateItem!],
  },
  {
    tool: "activate_floor_plan",
    input: { floorPlan: "Patio" },
    arrange: (api) => api.floorPlans!.list!.mockResolvedValue({ data: [] }),
    writes: (api) => [api.floorPlans!.setActive!],
  },
  {
    tool: "seat_reservation",
    input: { reservationId: "r1" },
    arrange: (api) => api.reservations!.get!.mockResolvedValue({ id: "r1", venueId: "other" }),
    writes: (api) => [api.reservations!.update!, api.tables!.updateStatus!],
  },
  {
    tool: "mark_no_show",
    input: { reservationId: "r1" },
    arrange: (api) => api.reservations!.get!.mockResolvedValue({ id: "r1", venueId: "other" }),
    writes: (api) => [api.reservations!.markNoShow!],
  },
];

describe("write tools that state nothing was written release the confirmed action (#8134)", () => {
  it.each(CASES.map((c) => [c.tool, c] as const))("%s", async (_name, c) => {
    const api = lazyApi();
    c.arrange(api);
    const call = gated(api, c.tool, c.input, c.venueId === null ? null : "v1");

    const first = await call();
    const second = await call();

    expect(first).not.toEqual(ALREADY);
    expect(first).not.toHaveProperty("notExecuted");
    expect(second).toEqual(first);
    for (const write of c.writes(api)) expect(write).not.toHaveBeenCalled();
  });
});

describe("reopen_closure: a server version-conflict wrote nothing (#8134)", () => {
  const closure = {
    id: "c1",
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-24",
    endsOn: "2026-12-26",
  };
  const input = {
    from: "2026-12-24",
    to: "2026-12-26",
    scope: "whole_venue",
    tellCancelledGuests: false,
    readAs: closureReadToken(closure as never, []),
  };

  function arranged(reopen: ReturnType<typeof vi.fn>) {
    const api = lazyApi();
    api.availability!.getConfig!.mockResolvedValue({
      ...EMPTY_CONFIG,
      config: { ...EMPTY_CONFIG.config, dateRules: [closure] },
    });
    api.availability!.listClosures!.mockResolvedValue([]);
    api.availability!.reopenClosure = reopen;
    return api;
  }

  it("the closure changed since it was listed: a second call is not 'already executed'", async () => {
    const reopen = vi.fn();
    const call = gated(arranged(reopen), "reopen_closure", { ...input, readAs: "stale" });

    const first = (await call()) as Record<string, unknown>;
    const second = await call();

    expect(first).toMatchObject({ refused: true, changed: true });
    expect(first).not.toHaveProperty("notExecuted");
    expect(second).toEqual(first);
    expect(reopen).not.toHaveBeenCalled();
  });

  it("a version-conflict from the write releases the action", async () => {
    const reopen = vi.fn().mockRejectedValue(problem(409, { code: "version-conflict" }));
    const call = gated(arranged(reopen), "reopen_closure", input);

    const first = (await call()) as Record<string, unknown>;
    const second = await call();

    expect(first).toMatchObject({ refused: true, changed: true });
    expect(second).toEqual(first);
    expect(reopen).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a network failure", new Error("socket hang up")],
    ["a 500", problem(500)],
    ["a 408 timeout", problem(408)],
    ["a 409 that is not a version-conflict", problem(409, { code: "closure-exists" })],
  ])("%s keeps the action spent", async (_name, error) => {
    const reopen = vi.fn().mockRejectedValue(error);
    const call = gated(arranged(reopen), "reopen_closure", input);

    await call();
    const second = await call();

    expect(second).toEqual(ALREADY);
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it("a success is spent: a second call cannot reopen again", async () => {
    const reopen = vi.fn().mockResolvedValue({ version: 9, changeId: "ch2" });
    const call = gated(arranged(reopen), "reopen_closure", input);

    await call();
    const second = await call();

    expect(second).toEqual(ALREADY);
    expect(reopen).toHaveBeenCalledTimes(1);
  });
});

describe("a write that was sent keeps the action spent, per tool family (#8134)", () => {
  it("close_dates: a failed save", async () => {
    const api = lazyApi();
    api.availability!.getConfig!.mockResolvedValue(EMPTY_CONFIG);
    api.availability!.getClosureImpact!.mockResolvedValue({
      reservations: 0,
      covers: 0,
      depositsHeld: 0,
      groups: [],
    });
    api.availability!.createClosure!.mockRejectedValue(new Error("socket hang up"));
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const call = gated(api, "close_dates", { scope: "whole_venue", date: future });

    await call();
    const second = await call();

    expect(second).toEqual(ALREADY);
    expect(api.availability!.createClosure).toHaveBeenCalledTimes(1);
  });

  it("notify_waitlist_party: a failed notify", async () => {
    const api = lazyApi();
    api.waitlist!.list!.mockResolvedValue([
      { id: "w1", guestName: "Ann", partySize: 2, status: "waiting", position: 1 },
    ]);
    api.waitlist!.notify!.mockRejectedValue(problem(503));
    const call = gated(api, "notify_waitlist_party", { guestName: "Ann" });

    await call();
    const second = await call();

    expect(second).toEqual(ALREADY);
    expect(api.waitlist!.notify).toHaveBeenCalledTimes(1);
  });

  it("modify_reservation: its first call is the write, so a failure stays spent", async () => {
    const api = lazyApi();
    api.reservations!.update!.mockRejectedValue(new Error("socket hang up"));
    const call = gated(api, "modify_reservation", { reservationId: "r1", partySize: 3 });

    await call();
    const second = await call();

    expect(second).toEqual(ALREADY);
    expect(api.reservations!.update).toHaveBeenCalledTimes(1);
  });
});

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

const ALREADY = {
  error:
    "This confirmed action was already attempted in this request and may or may not have run. Go by that attempt's result; ask the user to confirm again.",
};

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
    tool: "add_guest",
    input: { name: "Ann", phone: "555-0100" },
    arrange: () => undefined,
    writes: (api) => [api.guests!.findOrCreate!],
    venueId: null,
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
    // The 409 is only "nothing changed" because the reopen is never replayed.
    expect(reopen).toHaveBeenCalledWith("v1", "c1", false, { maxRetries: 0 }, expect.anything());
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

  it("the tool itself throwing after the write was sent keeps the action spent", async () => {
    // The reopen committed; building the answer from this malformed `stillClosed` then throws.
    const reopen = vi.fn().mockResolvedValue({ version: 9, stillClosed: { by: [{}] } });
    const tools = createAgentTools(createMockLogger(), arranged(reopen) as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName: "reopen_closure", toolInput: input },
    });
    const call = () => tools.reopen_closure!.execute!(input as never, toolCtx);

    await expect(Promise.resolve(call())).rejects.toThrow();
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
// ── A write that was sent keeps the action spent ──────────────────────────

const WAITING = [{ id: "w1", guestName: "Ann", partySize: 2, status: "waiting", position: 1 }];
const FREE_TABLE = {
  data: [{ id: "t1", tableNumber: "3", status: "AVAILABLE" }],
};
const ANN = { data: [{ id: "g1", name: "Ann" }] };
const SOUP_MENU = {
  id: "m1",
  name: "Lunch",
  sections: [
    {
      id: "s1",
      name: "Starters",
      items: [{ id: "i1", name: "Soup", status: "AVAILABLE" }],
    },
  ],
};
const TONIGHT_PAUSE = {
  id: "rule-1",
  kind: "tonight",
  targetKind: "booking",
  startsOn: "2099-01-01",
  expiresAt: "2099-01-02T00:00:00Z",
  payload: {},
};

interface SentCase {
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly arrange: (api: ReturnType<typeof lazyApi>, fail: unknown) => void;
  /** The endpoint whose rejection is the sent write. */
  readonly write: (api: ReturnType<typeof lazyApi>) => ReturnType<typeof vi.fn>;
}

const BOOKED = { id: "r1", venueId: "v1", status: "CONFIRMED", tableId: "t1" };

const SENT: readonly SentCase[] = [
  {
    tool: "create_reservation",
    input: {
      guestName: "Smith",
      date: "2026-05-18",
      startTime: "19:00",
      endTime: "21:00",
      partySize: 4,
      tableId: "t1",
    },
    arrange: (api, fail) => api.reservations!.create!.mockRejectedValue(fail),
    write: (api) => api.reservations!.create!,
  },
  {
    tool: "modify_reservation",
    input: { reservationId: "r1", partySize: 3 },
    arrange: (api, fail) => api.reservations!.update!.mockRejectedValue(fail),
    write: (api) => api.reservations!.update!,
  },
  {
    tool: "cancel_reservation",
    input: { reservationId: "r1" },
    arrange: (api, fail) => api.reservations!.cancel!.mockRejectedValue(fail),
    write: (api) => api.reservations!.cancel!,
  },
  {
    tool: "seat_walk_in",
    input: { partySize: 2, tableId: "t1" },
    arrange: (api, fail) => api.reservations!.walkIn!.mockRejectedValue(fail),
    write: (api) => api.reservations!.walkIn!,
  },
  {
    tool: "update_table_status",
    input: { table: "3", status: "DIRTY" },
    arrange: (api, fail) => {
      api.tables!.list!.mockResolvedValue(FREE_TABLE);
      api.tables!.updateStatus!.mockRejectedValue(fail);
    },
    write: (api) => api.tables!.updateStatus!,
  },
  {
    tool: "seat_reservation",
    input: { reservationId: "r1" },
    arrange: (api, fail) => {
      api.reservations!.get!.mockResolvedValue(BOOKED);
      api.tables!.list!.mockResolvedValue(FREE_TABLE);
      api.tables!.updateStatus!.mockRejectedValue(fail);
    },
    write: (api) => api.tables!.updateStatus!,
  },
  {
    tool: "mark_no_show",
    input: { reservationId: "r1" },
    arrange: (api, fail) => {
      api.reservations!.get!.mockResolvedValue(BOOKED);
      api.reservations!.markNoShow!.mockRejectedValue(fail);
    },
    write: (api) => api.reservations!.markNoShow!,
  },
  {
    tool: "change_tonight_availability",
    input: { change: "pause_online" },
    arrange: (api, fail) => {
      api.availability!.getConfig!.mockResolvedValue(EMPTY_CONFIG);
      api.availability!.setTonight!.mockRejectedValue(fail);
    },
    write: (api) => api.availability!.setTonight!,
  },
  {
    tool: "end_tonight_change",
    input: { change: "pause_online" },
    arrange: (api, fail) => {
      api.availability!.getConfig!.mockResolvedValue({
        ...EMPTY_CONFIG,
        config: { ...EMPTY_CONFIG.config, dateRules: [TONIGHT_PAUSE] },
      });
      api.availability!.endTonight!.mockRejectedValue(fail);
    },
    write: (api) => api.availability!.endTonight!,
  },
  {
    tool: "undo_availability_change",
    input: { summary: "Paused online booking" },
    arrange: (api, fail) => {
      api.availability!.listChanges!.mockResolvedValue({
        items: [],
        undoable: {
          id: "ch1",
          summary: "Paused online booking",
          at: "2099-01-01T00:00:00Z",
        },
      });
      api.availability!.getConfig!.mockResolvedValue(EMPTY_CONFIG);
      api.availability!.revertChange!.mockRejectedValue(fail);
    },
    write: (api) => api.availability!.revertChange!,
  },
  {
    tool: "close_dates",
    input: { scope: "whole_venue", date: "2099-01-05" },
    arrange: (api, fail) => {
      api.availability!.getConfig!.mockResolvedValue(EMPTY_CONFIG);
      api.availability!.getClosureImpact!.mockResolvedValue({
        reservations: 0,
        covers: 0,
        depositsHeld: 0,
        groups: [],
      });
      api.availability!.createClosure!.mockRejectedValue(fail);
    },
    write: (api) => api.availability!.createClosure!,
  },
  {
    tool: "add_guest",
    input: { name: "Ann", phone: "555-0100" },
    arrange: (api, fail) => api.guests!.findOrCreate!.mockRejectedValue(fail),
    write: (api) => api.guests!.findOrCreate!,
  },
  {
    tool: "update_guest",
    input: { guest: "Ann", name: "Anna" },
    arrange: (api, fail) => {
      api.guests!.search!.mockResolvedValue(ANN);
      api.guests!.update!.mockRejectedValue(fail);
    },
    write: (api) => api.guests!.update!,
  },
  {
    tool: "add_guest_note",
    input: { guest: "Ann", text: "Likes the window" },
    arrange: (api, fail) => {
      api.guests!.search!.mockResolvedValue(ANN);
      api.guests!.addNote!.mockRejectedValue(fail);
    },
    write: (api) => api.guests!.addNote!,
  },
  {
    tool: "send_win_back",
    input: { guest: "Ann" },
    arrange: (api, fail) => {
      api.guests!.getLapsing!.mockResolvedValue([{ name: "Ann", guestId: "g1" }]);
      api.guests!.sendWinBack!.mockRejectedValue(fail);
    },
    write: (api) => api.guests!.sendWinBack!,
  },
  {
    tool: "add_to_waitlist",
    input: { guestName: "Ann", partySize: 2, guestPhone: "555-0100" },
    arrange: (api, fail) => api.waitlist!.create!.mockRejectedValue(fail),
    write: (api) => api.waitlist!.create!,
  },
  {
    tool: "notify_waitlist_party",
    input: { guestName: "Ann" },
    arrange: (api, fail) => {
      api.waitlist!.list!.mockResolvedValue(WAITING);
      api.waitlist!.notify!.mockRejectedValue(fail);
    },
    write: (api) => api.waitlist!.notify!,
  },
  {
    tool: "seat_waitlist_party",
    input: { guestName: "Ann", table: "3" },
    arrange: (api, fail) => {
      api.waitlist!.list!.mockResolvedValue(WAITING);
      api.tables!.list!.mockResolvedValue(FREE_TABLE);
      api.reservations!.walkIn!.mockRejectedValue(fail);
    },
    write: (api) => api.reservations!.walkIn!,
  },
  {
    tool: "remove_from_waitlist",
    input: { guestName: "Ann" },
    arrange: (api, fail) => {
      api.waitlist!.list!.mockResolvedValue(WAITING);
      api.waitlist!.cancel!.mockRejectedValue(fail);
    },
    write: (api) => api.waitlist!.cancel!,
  },
  {
    tool: "set_menu_item_availability",
    input: { menu: "Lunch", item: "Soup", availability: "sold_out" },
    arrange: (api, fail) => {
      api.menus!.list!.mockResolvedValue([SOUP_MENU]);
      api.menus!.getById!.mockResolvedValue(SOUP_MENU);
      api.menus!.updateItem!.mockRejectedValue(fail);
    },
    write: (api) => api.menus!.updateItem!,
  },
  {
    tool: "update_menu_item",
    input: { menu: "Lunch", item: "Soup", price: "5.00" },
    arrange: (api, fail) => {
      api.menus!.list!.mockResolvedValue([SOUP_MENU]);
      api.menus!.getById!.mockResolvedValue(SOUP_MENU);
      api.menus!.updateItem!.mockRejectedValue(fail);
    },
    write: (api) => api.menus!.updateItem!,
  },
  {
    tool: "activate_floor_plan",
    input: { floorPlan: "Patio" },
    arrange: (api, fail) => {
      api.floorPlans!.list!.mockResolvedValue({
        data: [{ id: "p1", name: "Patio", isActive: false }],
      });
      api.floorPlans!.setActive!.mockRejectedValue(fail);
    },
    write: (api) => api.floorPlans!.setActive!,
  },
];

const FAILURES: readonly (readonly [string, () => unknown])[] = [
  ["a network failure", () => new Error("socket hang up")],
  ["a 503", () => problem(503)],
  ["a 403 the tool words as nothing changed", () => problem(403)],
];

describe("a write that was sent keeps the confirmed action spent, per tool (#8134)", () => {
  for (const c of SENT) {
    it.each(FAILURES)(`${c.tool}: %s`, async (_name, failure) => {
      const api = lazyApi();
      c.arrange(api, failure());
      const call = gated(api, c.tool, c.input);

      const first = await call();
      const second = await call();

      expect(first).not.toHaveProperty("notExecuted");
      expect(second).toEqual(ALREADY);
      expect(c.write(api)).toHaveBeenCalledTimes(1);
    });
  }
});

describe("a partial write keeps the confirmed action spent (#8134)", () => {
  it("seat_reservation: the booking was confirmed, then moving it to another table failed", async () => {
    const api = lazyApi();
    api.reservations!.get!.mockResolvedValue({ ...BOOKED, status: "PENDING" });
    api.tables!.list!.mockResolvedValue({
      data: [
        { id: "t1", tableNumber: "3", status: "AVAILABLE" },
        { id: "t2", tableNumber: "4", status: "AVAILABLE" },
      ],
    });
    api.reservations!.update!.mockResolvedValueOnce({}).mockRejectedValueOnce(problem(503));
    const call = gated(api, "seat_reservation", {
      reservationId: "r1",
      table: "4",
    });

    const first = (await call()) as Record<string, unknown>;
    const second = await call();

    expect(first.error).toEqual(expect.stringContaining("Confirming the booking"));
    expect(second).toEqual(ALREADY);
    expect(api.reservations!.update).toHaveBeenCalledTimes(2);
    expect(api.tables!.updateStatus).not.toHaveBeenCalled();
  });

  it("seat_waitlist_party: the walk-in was created, then the waitlist row could not be updated", async () => {
    const api = lazyApi();
    api.waitlist!.list!.mockResolvedValue(WAITING);
    api.tables!.list!.mockResolvedValue(FREE_TABLE);
    api.reservations!.walkIn!.mockResolvedValue({ id: "w-res" });
    api.waitlist!.seat!.mockRejectedValue(problem(503));
    const call = gated(api, "seat_waitlist_party", {
      guestName: "Ann",
      table: "3",
    });

    const first = await call();
    const second = await call();

    expect(first).toMatchObject({ seated: true, waitlistStale: true });
    expect(second).toEqual(ALREADY);
    expect(api.reservations!.walkIn).toHaveBeenCalledTimes(1);
    expect(api.waitlist!.seat).toHaveBeenCalledTimes(1);
  });
});

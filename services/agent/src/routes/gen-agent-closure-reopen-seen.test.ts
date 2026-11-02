import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { DateRule } from "@mbe/types";
import { createAgentTools } from "./gen-agent-tools.js";
import { closureReadToken } from "./gen-agent-closure-support.js";

/**
 * #8128: `reopen_closure` binds the reopen to the closure as the Host's conversation read it.
 * `list_closures` gives each closure a `readAs` token; the confirmed call carries it back; the
 * tool sends `seen` only when the closure still matches, and the server guards the gap after.
 */

const log = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

const NOW = new Date("2026-10-28T20:00:00Z");
const CLOSURE: DateRule = {
  id: "c1",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-26",
};
// Same span, so the reopen still names it; only what the Host read of it has changed.
const EXTENDED = { ...CLOSURE, staffNote: "kitchen fire, closed longer" };

function configState(dateRules: unknown[]) {
  return {
    version: 7,
    source: "rows",
    config: {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules,
    },
  };
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

describe("reopen_closure sends what the Host's conversation read (#8128)", () => {
  const api = {
    availability: {
      getConfig: vi.fn(),
      listClosures: vi.fn(),
      reopenClosure: vi.fn(),
    },
  };
  const readAs = closureReadToken(CLOSURE, []);
  const input = {
    from: "2026-12-24",
    to: "2026-12-26",
    scope: "whole_venue",
    tellCancelledGuests: false,
    readAs,
  };

  // The gate runs the confirmed input, never the one passed to execute.
  function tools(confirmed: boolean, toolInput: Record<string, unknown> = input) {
    return createAgentTools(log, api as never, {
      venueId: "v1",
      ...(confirmed
        ? { confirmedAction: { actionId: "call-1", toolName: "reopen_closure", toolInput } }
        : {}),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    vi.clearAllMocks();
    api.availability.getConfig.mockResolvedValue(configState([CLOSURE]));
    api.availability.listClosures.mockResolvedValue([]);
    api.availability.reopenClosure.mockResolvedValue({ version: 9, changeId: "ch2" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives each closure in list_closures a token for what it read", async () => {
    const result = (await tools(false).list_closures!.execute!({} as never, toolCtx)) as {
      closures: { readAs?: string }[];
    };

    expect(result.closures[0]?.readAs).toBe(readAs);
  });

  it("changes the token when the closure changes", () => {
    expect(closureReadToken(EXTENDED, [])).not.toBe(readAs);
    expect(
      closureReadToken(CLOSURE, [{ ...CLOSURE, id: "skip", seriesId: "c1" }] as never)
    ).not.toBe(readAs);
  });

  it("reopens with the closure it read as `seen`, when it is still what the Host read", async () => {
    const result = await tools(true).reopen_closure!.execute!(input as never, toolCtx);

    expect(api.availability.reopenClosure).toHaveBeenCalledWith(
      "v1",
      "c1",
      false,
      { maxRetries: 0 },
      { rule: CLOSURE, children: [] }
    );
    expect(result).toMatchObject({ reopened: true });
  });

  it("sends the closure's skips and one-date edits as `seen.children`", async () => {
    const child = { ...CLOSURE, id: "skip-1", kind: "skip", seriesId: "c1" } as DateRule;
    const withChild = { ...input, readAs: closureReadToken(CLOSURE, [child]) };
    api.availability.getConfig.mockResolvedValue(configState([CLOSURE, child]));

    await tools(true, withChild).reopen_closure!.execute!(withChild as never, toolCtx);

    expect(api.availability.reopenClosure).toHaveBeenCalledWith(
      "v1",
      "c1",
      false,
      { maxRetries: 0 },
      { rule: CLOSURE, children: [child] }
    );
  });

  it("does not reopen when a skip was added since the Host read the closure", async () => {
    const child = { ...CLOSURE, id: "skip-1", kind: "skip", seriesId: "c1" } as DateRule;
    api.availability.getConfig.mockResolvedValue(configState([CLOSURE, child]));

    const result = await tools(true).reopen_closure!.execute!(input as never, toolCtx);

    expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    expect(result).toMatchObject({ refused: true, changed: true });
  });

  it("does not reopen a closure changed after the Host read it", async () => {
    api.availability.getConfig.mockResolvedValue(configState([EXTENDED]));

    const result = await tools(true).reopen_closure!.execute!(input as never, toolCtx);

    expect(api.availability.reopenClosure).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      refused: true,
      changed: true,
      error: expect.stringMatching(/changed since it was listed.*look again.*Nothing was changed/s),
    });
  });

  it("reports a version-conflict refusal as recoverable, and does not retry", async () => {
    api.availability.reopenClosure.mockRejectedValue(
      Object.assign(new Error("409"), {
        problemDetails: {
          type: "about:blank",
          title: "Conflict",
          status: 409,
          detail: "changed",
          code: "version-conflict",
        },
      })
    );

    const result = await tools(true).reopen_closure!.execute!(input as never, toolCtx);

    expect(api.availability.reopenClosure).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      refused: true,
      changed: true,
      error: expect.stringMatching(/changed since it was listed.*look again.*Nothing was changed/s),
    });
  });

  it("is not callable without the token the Host's conversation read", () => {
    const schema = (
      tools(false).reopen_closure as unknown as {
        inputSchema: { safeParse: (v: unknown) => { success: boolean } };
      }
    ).inputSchema;

    const { readAs: _omitted, ...withoutToken } = input;

    expect(schema.safeParse(withoutToken).success).toBe(false);
    expect(schema.safeParse(input).success).toBe(true);
  });
});

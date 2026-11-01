import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
// eslint-disable-next-line no-restricted-imports -- the retry this pins lives in the real client, so a mock can't show it
import { createApiClient } from "@mbe/api-client";
import { createAgentTools } from "./gen-agent-tools.js";

/**
 * #8035: the api-client replays a DELETE after a 502 or a lost response. If the
 * first attempt committed, the replay gets a 4xx, and the tool would report that
 * refusal as "Nothing was changed." These run the real client over a fake fetch,
 * so a tool that lets the replay happen fails here.
 */

const log = {
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

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

const NOW = new Date("2026-10-28T20:00:00Z");

const refused = (status: number, detail: string) =>
  new Response(JSON.stringify({ type: "about:blank", title: "Refused", status, detail }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

const NO_ANSWER = [
  ["a 502", () => Promise.resolve(new Response("bad gateway", { status: 502 }))],
  ["a socket reset", () => Promise.reject(new TypeError("fetch failed"))],
] as const;

const unsure = (read: string) =>
  `Couldn't confirm the change was saved. Check ${read} before trying again.`;

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

const TONIGHT_RULE = {
  id: "r1",
  kind: "tonight",
  targetKind: "booking",
  startsOn: "2026-10-28",
  expiresAt: "2026-10-29T10:00:00Z",
  payload: { version: 1, stop: { from: 0, to: 2880 } },
};

const CLOSURE = {
  id: "c1",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-26",
};

describe("write tools the api-client would replay", () => {
  const fetchMock = vi.fn();
  const api = createApiClient({ baseUrl: "http://api.test", getAccessToken: () => "token" });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function run(toolName: string, input: Record<string, unknown>) {
    const tools = createAgentTools(log, api as never, {
      venueId: "v1",
      confirmedAction: { actionId: "call-1", toolName, toolInput: input },
    });
    return tools[toolName]!.execute!(input as never, toolCtx);
  }

  describe.each(NO_ANSWER)("after %s", (_name, noAnswer) => {
    it("cancel_reservation doesn't turn a committed cancel into a refusal", async () => {
      fetchMock
        .mockImplementationOnce(noAnswer)
        .mockResolvedValue(refused(409, "Invalid status transition: CANCELLED to CANCELLED"));

      const result = await run("cancel_reservation", { reservationId: "r1" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ error: unsure("lookup_reservation") });
    });

    it("cancel_reservation doesn't report its own in-flight attempt as a refusal", async () => {
      fetchMock
        .mockImplementationOnce(noAnswer)
        .mockResolvedValue(
          refused(409, "Another request is already processing this cancellation. Please retry.")
        );

      const result = await run("cancel_reservation", { reservationId: "r1" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ error: unsure("lookup_reservation") });
    });

    it("end_tonight_change doesn't turn a committed end into a refusal", async () => {
      vi.spyOn(api.availability, "getConfig").mockResolvedValue(
        configState([TONIGHT_RULE]) as never
      );
      fetchMock
        .mockImplementationOnce(noAnswer)
        .mockResolvedValue(refused(404, "Tonight change not found"));

      const result = await run("end_tonight_change", { change: "pause_online" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ error: unsure("list_tonight_changes") });
    });

    it("reopen_closure doesn't turn a committed reopen into a refusal", async () => {
      vi.spyOn(api.availability, "getConfig").mockResolvedValue(configState([CLOSURE]) as never);
      vi.spyOn(api.availability, "listClosures").mockResolvedValue([]);
      fetchMock
        .mockImplementationOnce(noAnswer)
        .mockResolvedValue(refused(404, "Closure not found"));

      const result = await run("reopen_closure", {
        from: "2026-12-24",
        to: "2026-12-26",
        scope: "whole_venue",
        tellCancelledGuests: false,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ error: unsure("list_closures") });
    });
  });

  it("still passes on a refusal the first attempt got", async () => {
    fetchMock.mockResolvedValue(refused(409, "This booking is already seated."));

    const result = await run("cancel_reservation", { reservationId: "r1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      refused: true,
      error: "This booking is already seated. Nothing was changed.",
    });
  });
});

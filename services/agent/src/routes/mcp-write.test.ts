import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mcpRoutes, type McpApiFactory } from "./mcp.js";
import { CONFIRM_TTL_MS } from "./mcp-confirm.js";

function problem(status: number, detail = "Refused.") {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail },
  });
}

const VENUE = { id: "v1", name: "Bar Uno", slug: "bar-uno", ianaTimezone: "America/New_York" };
const WRITER = "mbe_pat_writer";
const READER = "mbe_pat_reader";
const PAUSE_RULE = {
  id: "rule-1",
  kind: "closure",
  targetKind: "tables",
  tableIds: ["t1"],
  startsOn: "2026-01-01",
  endsOn: null,
  window: null,
};

function createMockApi() {
  return {
    accessTokens: { current: vi.fn(async () => ({ write: true })) },
    venues: {
      list: vi.fn(async () => ({ data: [VENUE] })),
      get: vi.fn(async (id: string) => {
        if (id !== "v1") throw problem(403, "Not a member of this venue.");
        return VENUE;
      }),
    },
    availability: {
      getConfig: vi.fn(async () => ({ version: 3, config: { dateRules: [PAUSE_RULE] } })),
      getClosureImpact: vi.fn(async () => ({ reservations: 0, groups: [] })),
      createClosure: vi.fn(async () => ({})),
      reopenClosure: vi.fn(async () => ({})),
    },
    tables: {
      list: vi.fn(async () => ({ data: [{ id: "t1", name: "Patio 1", tableNumber: "1" }] })),
    },
    reservations: {
      get: vi.fn(async () => ({
        id: "r1",
        guestName: "Ana Lopez",
        startTime: "2026-12-01T23:00:00.000Z",
        endTime: "2026-12-02T00:30:00.000Z",
        partySize: 2,
        tableId: "t1",
        status: "CONFIRMED",
      })),
      update: vi.fn(async () => ({ id: "r1", partySize: 4 })),
      list: vi.fn(async () => ({ data: [] })),
    },
    guests: { search: vi.fn(async () => ({ data: [] })) },
  };
}

const WRITE_TOOLS = ["modify_reservation", "pause_tables", "resume_tables"];

describe("MCP write tools (#9781)", () => {
  let app: FastifyInstance;
  let api: ReturnType<typeof createMockApi>;
  let built: { token: string; headers: Record<string, string> | undefined }[];
  let url: string;

  beforeEach(async () => {
    api = createMockApi();
    built = [];
    const factory: McpApiFactory = (token, headers) => {
      built.push({ token, headers });
      if (new Set([READER]).has(token)) {
        return {
          ...api,
          accessTokens: { current: vi.fn(async () => ({ write: false })) },
        } as never;
      }
      return api as never;
    };
    app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    await app.register(mcpRoutes, {
      createApi: factory,
      rateLimit: { max: 1000, timeWindow: "1 minute" },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/gen/mcp`;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      })
    );
    return client;
  }

  /** A tool call's result, with a refusal (thrown or `isError`) folded into one shape. */
  async function call(client: Client, name: string, args: Record<string, unknown>) {
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = JSON.stringify(result.content);
      return { isError: result.isError === true, text, json: safeParse(result) };
    } catch (err) {
      return { isError: true, text: String(err), json: undefined };
    }
  }

  const safeParse = (result: object) => {
    const first = (result as { content?: { text?: string }[] }).content?.[0]?.text;
    try {
      return first
        ? (JSON.parse(first) as { confirmToken?: string; preview?: Record<string, unknown> })
        : undefined;
    } catch {
      return undefined;
    }
  };

  const modifyArgs = { venueId: "v1", reservationId: "r1", partySize: 4 };

  describe("registration", () => {
    it("shows a read-only token exactly the five read tools and no write tool", async () => {
      const client = await connect(READER);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "check_availability",
        "list_today_reservations",
        "list_venues",
        "lookup_reservation",
        "search_guests",
      ]);
      const refused = await call(client, "modify_reservation", modifyArgs);
      expect(refused.isError).toBe(true);
      expect(api.reservations.update).not.toHaveBeenCalled();
      await client.close();
    });

    it("fails closed to read-only when the scope cannot be read", async () => {
      api.accessTokens.current.mockRejectedValue(new Error("boom"));
      const client = await connect(WRITER);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).not.toContain("modify_reservation");
      await client.close();
    });

    it("adds exactly the three write tools, marked destructive, for a write-scoped token", async () => {
      const client = await connect(WRITER);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(8);
      for (const name of WRITE_TOOLS) {
        const tool = tools.find((t) => t.name === name)!;
        expect(tool.annotations?.destructiveHint).toBe(true);
        expect(tool.annotations?.readOnlyHint).toBe(false);
      }
      const modify = tools.find((t) => t.name === "modify_reservation")!;
      expect(Object.keys(modify.inputSchema.properties ?? {}).sort()).toEqual(
        [
          "confirmToken",
          "date",
          "endTime",
          "partySize",
          "reservationId",
          "startTime",
          "tableId",
          "venueId",
        ].sort()
      );
      await client.close();
    });

    it("rejects fields outside the schema (notes, status, override)", async () => {
      const client = await connect(WRITER);
      for (const extra of [
        { notes: "x" },
        { status: "CANCELLED" },
        { override: { reason: "x" } },
      ]) {
        const refused = await call(client, "modify_reservation", { ...modifyArgs, ...extra });
        expect(refused.isError).toBe(true);
      }
      const pause = await call(client, "pause_tables", {
        venueId: "v1",
        tables: ["Patio 1"],
        until: "until reopened",
        decisions: [{}],
      });
      expect(pause.isError).toBe(true);
      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(api.availability.getClosureImpact).not.toHaveBeenCalled();
      await client.close();
    });
  });

  describe("modify_reservation", () => {
    it("writes nothing on the first call and returns a preview plus a confirm token", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      expect(first.isError).toBe(false);
      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(first.json?.confirmToken).toEqual(expect.any(String));
      expect(first.json?.confirmToken).not.toContain(WRITER);
      expect(first.json?.preview).toMatchObject({
        reservationId: "r1",
        changes: { partySize: 4 },
        current: { partySize: 2 },
      });
      expect(first.text).not.toContain(WRITER);
      await client.close();
    });

    it("runs the stored input on confirm, ignoring changed arguments, and forwards the audit headers", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      const second = await call(client, "modify_reservation", {
        venueId: "v1",
        reservationId: "someone-elses",
        partySize: 99,
        confirmToken: first.json?.confirmToken,
      });
      expect(second.isError).toBe(false);
      expect(api.reservations.update).toHaveBeenCalledTimes(1);
      expect(api.reservations.update).toHaveBeenCalledWith("r1", { partySize: 4 });
      const writer = built.find((b) => b.headers?.["Mbe-Confirm-Nonce"]);
      expect(writer?.token).toBe(WRITER);
      expect(writer?.headers).toMatchObject({
        "Mbe-Tool": "modify_reservation",
        "Mbe-Confirm-Nonce": expect.any(String),
      });
      await client.close();
    });

    it("refuses a tampered token and writes nothing", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      const token = first.json?.confirmToken as string;
      const tampered = `${token.slice(0, 10)}${token[10] === "A" ? "B" : "A"}${token.slice(11)}`;
      const second = await call(client, "modify_reservation", {
        ...modifyArgs,
        confirmToken: tampered,
      });
      expect(second.isError).toBe(true);
      expect(api.reservations.update).not.toHaveBeenCalled();
      await client.close();
    });

    it("refuses a token minted for another tool or venue", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      const wrongTool = await call(client, "pause_tables", {
        venueId: "v1",
        tables: ["Patio 1"],
        until: "until reopened",
        confirmToken: first.json?.confirmToken,
      });
      expect(wrongTool.isError).toBe(true);
      const wrongVenue = await call(client, "modify_reservation", {
        ...modifyArgs,
        venueId: "someone-elses",
        confirmToken: first.json?.confirmToken,
      });
      expect(wrongVenue.isError).toBe(true);
      expect(api.reservations.update).not.toHaveBeenCalled();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
      await client.close();
    });

    it("refuses a token minted with a different access token", async () => {
      const mine = await connect(WRITER);
      const first = await call(mine, "modify_reservation", modifyArgs);
      const theirs = await connect("mbe_pat_other_writer");
      const second = await call(theirs, "modify_reservation", {
        ...modifyArgs,
        confirmToken: first.json?.confirmToken,
      });
      expect(second.isError).toBe(true);
      expect(api.reservations.update).not.toHaveBeenCalled();
      await mine.close();
      await theirs.close();
    });

    it("refuses an expired token", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + CONFIRM_TTL_MS + 1000 });
      const second = await call(client, "modify_reservation", {
        ...modifyArgs,
        confirmToken: first.json?.confirmToken,
      });
      expect(second.isError).toBe(true);
      expect(second.text).toMatch(/expired/i);
      expect(api.reservations.update).not.toHaveBeenCalled();
      await client.close();
    });

    it("surfaces the reservations service's 409 on a replayed token as a tool error", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "modify_reservation", modifyArgs);
      api.reservations.update.mockRejectedValueOnce(
        problem(409, "This confirmation was already used.")
      );
      const replay = await call(client, "modify_reservation", {
        ...modifyArgs,
        confirmToken: first.json?.confirmToken,
      });
      expect(replay.isError).toBe(true);
      expect(replay.text).toContain("already used");
      await client.close();
    });

    it("needs at least one change, and a venue the user belongs to", async () => {
      const client = await connect(WRITER);
      const empty = await call(client, "modify_reservation", {
        venueId: "v1",
        reservationId: "r1",
      });
      expect(empty.isError).toBe(true);
      expect(empty.json?.confirmToken).toBeUndefined();
      const foreign = await call(client, "modify_reservation", { ...modifyArgs, venueId: "x" });
      expect(foreign.isError).toBe(true);
      expect(foreign.text).toContain("Not a member");
      await client.close();
    });
  });

  describe("pause_tables", () => {
    const pauseArgs = { venueId: "v1", tables: ["Patio 1"], until: "until reopened" };

    it("previews the closure impact without saving, then saves a table pause with no decisions", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "pause_tables", pauseArgs);
      expect(first.isError).toBe(false);
      expect(api.availability.getClosureImpact).toHaveBeenCalledTimes(1);
      expect(api.availability.createClosure).not.toHaveBeenCalled();
      expect(first.json?.preview).toMatchObject({ tables: ["Patio 1"], bookingsAffected: 0 });

      const second = await call(client, "pause_tables", {
        venueId: "v1",
        tables: ["Other"],
        until: "2030-01-01",
        confirmToken: first.json?.confirmToken,
      });
      expect(second.isError).toBe(false);
      expect(api.availability.createClosure).toHaveBeenCalledTimes(1);
      const [venue, body] = api.availability.createClosure.mock.calls[0] as unknown as [
        string,
        { decisions: unknown[]; rule: { tableIds: string[]; targetKind: string } },
      ];
      expect(venue).toBe("v1");
      expect(body.decisions).toEqual([]);
      expect(body.rule).toMatchObject({ targetKind: "tables", tableIds: ["t1"] });
      await client.close();
    });

    it("sends the nonce only on the saving call, never on the impact read", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "pause_tables", pauseArgs);
      await call(client, "pause_tables", { ...pauseArgs, confirmToken: first.json?.confirmToken });
      const withNonce = built.filter((b) => b.headers?.["Mbe-Confirm-Nonce"]);
      expect(withNonce).toHaveLength(1);
      expect(withNonce[0]?.headers?.["Mbe-Tool"]).toBe("pause_tables");
      const impactClients = built.filter(
        (b) => b.headers?.["Mbe-Tool"] === "pause_tables" && !b.headers["Mbe-Confirm-Nonce"]
      );
      expect(impactClients.length).toBeGreaterThan(0);
      await client.close();
    });

    it("refuses on the preview when bookings sit on the tables, and offers no token", async () => {
      api.availability.getClosureImpact.mockResolvedValueOnce({
        reservations: 2,
        covers: 6,
        groups: [{ date: "2026-12-01" }],
      } as never);
      const client = await connect(WRITER);
      const first = await call(client, "pause_tables", pauseArgs);
      expect(first.isError).toBe(true);
      expect(first.json?.confirmToken).toBeUndefined();
      expect(api.availability.createClosure).not.toHaveBeenCalled();
      await client.close();
    });
  });

  describe("resume_tables", () => {
    const resumeArgs = { venueId: "v1", tables: ["Patio 1"] };

    it("previews the pause it would end, then reopens the whole rule telling no guest", async () => {
      const client = await connect(WRITER);
      const first = await call(client, "resume_tables", resumeArgs);
      expect(first.isError).toBe(false);
      expect(api.availability.reopenClosure).not.toHaveBeenCalled();
      expect(first.json?.preview).toMatchObject({ tables: ["Patio 1"] });

      const second = await call(client, "resume_tables", {
        ...resumeArgs,
        confirmToken: first.json?.confirmToken,
      });
      expect(second.isError).toBe(false);
      expect(api.availability.reopenClosure).toHaveBeenCalledTimes(1);
      expect(api.availability.reopenClosure.mock.calls[0]?.slice(0, 3)).toEqual([
        "v1",
        "rule-1",
        false,
      ]);
      const writer = built.find((b) => b.headers?.["Mbe-Confirm-Nonce"]);
      expect(writer?.headers?.["Mbe-Tool"]).toBe("resume_tables");
      await client.close();
    });

    it("reports tables that are not paused, with no token", async () => {
      api.availability.getConfig.mockResolvedValueOnce({
        version: 1,
        config: { dateRules: [] },
      } as never);
      const client = await connect(WRITER);
      const first = await call(client, "resume_tables", resumeArgs);
      expect(first.isError).toBe(true);
      expect(first.json?.confirmToken).toBeUndefined();
      await client.close();
    });
  });
});

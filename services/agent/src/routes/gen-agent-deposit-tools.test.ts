import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { createAgentTools } from "./gen-agent-tools.js";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";
import { buildAgentSystemPrompt } from "./gen-agent-prompt.js";

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

function createMockApiClient() {
  return {
    reservations: { get: vi.fn() },
    deposits: {
      getByReservation: vi.fn(),
      create: vi.fn(),
      capture: vi.fn(),
      refund: vi.fn(),
      forfeit: vi.fn(),
      transition: vi.fn(),
    },
  };
}

function problem(status: number) {
  return Object.assign(new Error(`${status} refused`), {
    problemDetails: { type: "about:blank", title: "Refused", status, detail: "Refused." },
  });
}

const toolCtx = {
  toolCallId: "call-1",
  messages: [],
  abortSignal: undefined as never,
  context: undefined as never,
};

function deposit(fields: Record<string, unknown> = {}) {
  return {
    id: "dep_1",
    reservationId: "r1",
    amountCents: 5000,
    currency: "USD",
    status: "held",
    stripePaymentIntentId: "pi_secret_123",
    stripeCustomerId: "cus_secret_456",
    heldAt: "2026-11-20T18:00:00.000Z",
    appliedAt: null,
    refundedAt: null,
    forfeitedAt: null,
    uncollectableAt: null,
    postCaptureRefundCents: null,
    createdAt: "2026-11-20T17:59:00.000Z",
    updatedAt: "2026-11-20T18:00:00.000Z",
    ...fields,
  };
}

describe("get_deposit_status", () => {
  let log: FastifyBaseLogger;
  let api: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    log = createMockLogger();
    api = createMockApiClient();
    api.reservations.get.mockResolvedValue({ id: "r1", venueId: "v1" });
  });

  function run(input: Record<string, unknown> = { reservationId: "r1" }) {
    const tools = createAgentTools(log, api as never, { venueId: "v1" });
    return tools["get_deposit_status"]!.execute!(input as never, toolCtx);
  }

  it.each([
    ["held", { status: "held" }],
    ["applied", { status: "applied", appliedAt: "2026-11-21T02:00:00.000Z" }],
    ["refunded", { status: "refunded", refundedAt: "2026-11-21T03:00:00.000Z" }],
    ["partial_refunded", { status: "partial_refunded", refundedAt: "2026-11-21T03:00:00.000Z" }],
    ["forfeited", { status: "forfeited", forfeitedAt: "2026-11-21T04:00:00.000Z" }],
    ["pending", { status: "pending" }],
    ["uncollectable", { status: "uncollectable", uncollectableAt: "2026-11-21T05:00:00.000Z" }],
  ])("returns the %s state with amount and currency", async (state, fields) => {
    api.deposits.getByReservation.mockResolvedValue(deposit(fields));

    const result = await run();

    expect(api.deposits.getByReservation).toHaveBeenCalledWith("r1");
    expect(result).toMatchObject({
      hasDeposit: true,
      status: state,
      amountCents: 5000,
      currency: "USD",
    });
    for (const [key, value] of Object.entries(fields)) {
      expect(result).toMatchObject({ [key]: value });
    }
  });

  it("says plainly when the reservation has no deposit", async () => {
    api.deposits.getByReservation.mockResolvedValue(null);

    const result = await run();

    expect(result).toMatchObject({ hasDeposit: false });
    expect(JSON.stringify(result)).toMatch(/no deposit/i);
  });

  it("refuses a reservation at another venue without reading its deposit", async () => {
    api.reservations.get.mockResolvedValue({ id: "r1", venueId: "v2" });

    const result = await run();

    expect(result).toMatchObject({ error: expect.stringMatching(/isn't at this venue/) });
    expect(api.deposits.getByReservation).not.toHaveBeenCalled();
  });

  it("refuses an unknown reservation", async () => {
    api.reservations.get.mockRejectedValue(problem(404));

    const result = await run({ reservationId: "nope" });

    expect(result).toMatchObject({ refused: true });
    expect(api.deposits.getByReservation).not.toHaveBeenCalled();
  });

  it("asks for a venue when none is selected", async () => {
    const tools = createAgentTools(log, api as never, {});
    const result = await tools["get_deposit_status"]!.execute!(
      { reservationId: "r1" } as never,
      toolCtx
    );

    expect(result).toMatchObject({ error: expect.stringMatching(/No venue/) });
    expect(api.reservations.get).not.toHaveBeenCalled();
  });

  it("says the user lacks permission on a 403", async () => {
    api.deposits.getByReservation.mockRejectedValue(problem(403));

    const result = await run();

    expect(result).toMatchObject({
      refused: true,
      error: expect.stringMatching(/permission/),
    });
  });

  it("never returns Stripe identifiers or internal ids", async () => {
    api.deposits.getByReservation.mockResolvedValue(deposit());

    const text = JSON.stringify(await run());

    expect(text).not.toMatch(/pi_secret|cus_secret|stripe|clientSecret|dep_1/i);
  });

  it("never calls a deposit write", async () => {
    api.deposits.getByReservation.mockResolvedValue(deposit());

    await run();

    for (const name of ["create", "capture", "refund", "forfeit", "transition"] as const) {
      expect(api.deposits[name]).not.toHaveBeenCalled();
    }
  });

  it("is a read tool: not among the confirmed write tools", () => {
    expect(GEN_WRITE_TOOL_NAMES).not.toContain("get_deposit_status");
  });

  it("has no charge, refund, waive or capture tool", () => {
    const tools = createAgentTools(log, api as never, { venueId: "v1" });
    const depositTools = Object.keys(tools).filter((name) => /deposit/i.test(name));
    expect(depositTools).toEqual(["get_deposit_status"]);
  });
});

describe("deposits in the prompt", () => {
  const prompt = buildAgentSystemPrompt({
    venueId: "v",
    now: new Date("2026-11-24T12:00:00Z"),
    catalogPrompt: "CATALOG",
  });

  it("lets chat tell deposit status", () => {
    expect(prompt).toMatch(/get_deposit_status/);
    expect(prompt).not.toMatch(/You can't manage deposits yet/);
  });

  // Deposit controls live in the booking's details on the Timeline page; the
  // Reservations list has none, so "the reservation page" sent hosts nowhere.
  it("keeps charging, refunding and waiving in the booking's details on the Timeline page", () => {
    expect(prompt).toMatch(
      /Charging, refunding or waiving a deposit stays in the booking's details on the Timeline page/
    );
    expect(prompt).not.toMatch(/reservation page/);
  });

  it("never states a partial refund amount it cannot see", () => {
    expect(prompt).toMatch(/partial_refunded.*refunded amount isn't shown/);
  });

  it("warns that a no-show or cancellation may capture or refund the deposit", () => {
    expect(prompt).toMatch(/no-show or cancelling may capture or refund the deposit/);
  });
});

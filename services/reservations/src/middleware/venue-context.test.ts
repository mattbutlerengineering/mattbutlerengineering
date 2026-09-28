import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/venue-context-store.js", () => ({
  enterVenueContext: vi.fn(),
}));

import type { FastifyRequest } from "fastify";
import {
  setVenueContext,
  venueContextPreHandler,
  type VenueContextClient,
} from "./venue-context.js";
import { enterVenueContext } from "../services/venue-context-store.js";
import { setRlsTripwireLogger } from "../services/rls-context-mode.js";

function fakeRequest(): FastifyRequest {
  return {} as unknown as FastifyRequest;
}

function fakeClient(): VenueContextClient & { $executeRaw: ReturnType<typeof vi.fn> } {
  return { $executeRaw: vi.fn().mockResolvedValue(0) };
}

describe("setVenueContext", () => {
  it("sets app.venue_id via a parameterized set_config() when a venue id is given", async () => {
    const client = fakeClient();

    await setVenueContext(client, "venue-1");

    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = client.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    // Parameterized tagged-template call: the venue id must be a bound
    // value, never interpolated into the SQL string itself. `set_config()`
    // is used instead of `SET LOCAL app.venue_id = ?` because Postgres's
    // SET/SET LOCAL grammar does not accept a bind parameter in the value
    // position — only set_config() does.
    expect(strings.join("?")).toBe("SELECT set_config('app.venue_id', ?, true)");
    expect(values).toEqual(["venue-1"]);
  });

  it("does not run set_config() when venueId is null (default-deny per ADR-026 §4)", async () => {
    const client = fakeClient();

    await setVenueContext(client, null);

    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not run set_config() when venueId is undefined", async () => {
    const client = fakeClient();

    await setVenueContext(client, undefined);

    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  describe("unscoped-query tripwire (ADR-026 §3.3 / #5369 PR 1)", () => {
    const logger = { warn: vi.fn() };

    beforeEach(() => {
      logger.warn.mockClear();
      setRlsTripwireLogger(logger);
    });

    it("logs rls_unscoped_query (model: null — this function can't attribute one) when called with no options at all", async () => {
      const client = fakeClient();

      await setVenueContext(client, null);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { model: null, method: "setVenueContext", route: null },
        "rls_unscoped_query"
      );
    });

    it("skips the check when skipUnscopedQueryCheck is set (the venue-scoped-prisma auto-wrap's own call site)", async () => {
      const client = fakeClient();

      await setVenueContext(client, null, { skipUnscopedQueryCheck: true });

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("does not log when a real venue id is given", async () => {
      const client = fakeClient();

      await setVenueContext(client, "venue-1");

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});

describe("venueContextPreHandler", () => {
  beforeEach(() => {
    vi.mocked(enterVenueContext).mockClear();
  });

  // The shape actually used in production: app.ts's `resolveGlobalVenueId`
  // is synchronous (composed from the synchronous venue-access.ts helpers).
  // These tests guard TWO independently load-bearing properties documented
  // on venueContextPreHandler's doc comment:
  //   1. enterVenueContext runs SYNCHRONOUSLY (same tick as the preHandler
  //      call, before any `await`) — an `await resolveVenueId(request)`
  //      then a separate `enterVenueContext(...)` statement reproduces a
  //      one-request-late AsyncLocalStorage propagation failure against the
  //      real Fastify app, even when the resolver itself never actually
  //      awaits anything asynchronous.
  //   2. the preHandler ALWAYS returns a genuine Promise, never a bare
  //      `undefined` — Fastify's preHandler hook runner only re-invokes its
  //      internal `next` when the hook's return value is thenable; a plain
  //      non-Promise return hangs the whole preHandler chain forever with
  //      no error. Measured directly against the real app.
  describe("synchronous resolver", () => {
    it("calls enterVenueContext synchronously AND returns a genuine Promise (never bare undefined)", async () => {
      const resolveVenueId = vi.fn().mockReturnValue("venue-42");
      const preHandler = venueContextPreHandler(resolveVenueId);
      const request = fakeRequest();

      const result = preHandler(request, {} as never);

      // Synchronous: already called by the time preHandler() returns, not
      // deferred to a later microtask.
      expect(resolveVenueId).toHaveBeenCalledWith(request);
      expect(enterVenueContext).toHaveBeenCalledTimes(1);
      expect(enterVenueContext).toHaveBeenCalledWith("venue-42");

      // A real Promise, satisfying Fastify's hook-completion contract.
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it("stashes null when the synchronous resolver returns null", async () => {
      const resolveVenueId = vi.fn().mockReturnValue(null);
      const preHandler = venueContextPreHandler(resolveVenueId);

      await preHandler(fakeRequest(), {} as never);

      expect(enterVenueContext).toHaveBeenCalledWith(null);
    });

    it("stashes null when the synchronous resolver returns undefined", async () => {
      const resolveVenueId = vi.fn().mockReturnValue(undefined);
      const preHandler = venueContextPreHandler(resolveVenueId);

      await preHandler(fakeRequest(), {} as never);

      expect(enterVenueContext).toHaveBeenCalledWith(null);
    });
  });

  // Type-permitted (VenueIdResolver allows a Promise), not used by the
  // current global wiring — e.g. an entity-lookup resolver like
  // venueIdFromEntity. Not verified to be free of the same timing issue this
  // module's doc comment documents; kept correct at the unit level only.
  describe("async resolver", () => {
    it("stashes the resolved venue id via enterVenueContext once the promise resolves", async () => {
      const resolveVenueId = vi.fn().mockResolvedValue("venue-42");
      const preHandler = venueContextPreHandler(resolveVenueId);
      const request = fakeRequest();

      await preHandler(request, {} as never);

      expect(resolveVenueId).toHaveBeenCalledWith(request);
      expect(enterVenueContext).toHaveBeenCalledTimes(1);
      expect(enterVenueContext).toHaveBeenCalledWith("venue-42");
    });

    it("stashes null when no venue context is resolved (public routes)", async () => {
      const resolveVenueId = vi.fn().mockResolvedValue(null);
      const preHandler = venueContextPreHandler(resolveVenueId);

      await preHandler(fakeRequest(), {} as never);

      expect(enterVenueContext).toHaveBeenCalledWith(null);
    });

    it("stashes null when the resolver returns undefined", async () => {
      const resolveVenueId = vi.fn().mockResolvedValue(undefined);
      const preHandler = venueContextPreHandler(resolveVenueId);

      await preHandler(fakeRequest(), {} as never);

      expect(enterVenueContext).toHaveBeenCalledWith(null);
    });
  });
});

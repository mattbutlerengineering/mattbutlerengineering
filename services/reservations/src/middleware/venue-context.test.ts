import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      $executeRaw: vi.fn().mockResolvedValue(0),
    },
  });
});

import type { FastifyRequest } from "fastify";
import { setVenueContext, venueContextPreHandler } from "./venue-context.js";
import { prisma } from "../services/database.js";

function fakeRequest(): FastifyRequest {
  return {} as unknown as FastifyRequest;
}

describe("setVenueContext", () => {
  beforeEach(() => {
    vi.mocked(prisma.$executeRaw).mockClear();
  });

  it("sets app.venue_id via a parameterized set_config() when a venue id is given", async () => {
    await setVenueContext(prisma, "venue-1");

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = vi.mocked(prisma.$executeRaw).mock.calls[0] as unknown as [
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
    await setVenueContext(prisma, null);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not run set_config() when venueId is undefined", async () => {
    await setVenueContext(prisma, undefined);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("venueContextPreHandler", () => {
  beforeEach(() => {
    vi.mocked(prisma.$executeRaw).mockClear();
  });

  it("sets app.venue_id for an authenticated request with a resolved venue", async () => {
    const resolveVenueId = vi.fn().mockResolvedValue("venue-42");
    const preHandler = venueContextPreHandler(resolveVenueId);
    const request = fakeRequest();

    await preHandler(request, {} as never);

    expect(resolveVenueId).toHaveBeenCalledWith(request);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const values = vi.mocked(prisma.$executeRaw).mock.calls[0]?.slice(1);
    expect(values).toEqual(["venue-42"]);
  });

  it("does not set app.venue_id when no venue context is resolved (public routes)", async () => {
    const resolveVenueId = vi.fn().mockResolvedValue(null);
    const preHandler = venueContextPreHandler(resolveVenueId);
    const request = fakeRequest();

    await preHandler(request, {} as never);

    expect(resolveVenueId).toHaveBeenCalledWith(request);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not set app.venue_id when the resolver returns undefined", async () => {
    const resolveVenueId = vi.fn().mockResolvedValue(undefined);
    const preHandler = venueContextPreHandler(resolveVenueId);
    const request = fakeRequest();

    await preHandler(request, {} as never);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

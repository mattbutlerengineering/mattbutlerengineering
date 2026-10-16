import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";
import { getCurrentVenueId } from "../services/venue-context-store.js";

vi.mock("../services/resolve-venue.js", () => ({ resolveVenueId: vi.fn() }));

// The scope reads the reservation service from `request.server.services` (issue #6772).
const reservationService = {
  getById: vi.fn(),
} as unknown as DomainServices["reservationService"];

const { resolveVenueId } = await import("../services/resolve-venue.js");
const { generateManageToken } = await import("./public-reservations.js");
const { manageTokenScoped } = await import("./manage-token-scope.js");
const { venueScopeOf } = await import("./venue-scope.js");

const resolveMock = vi.mocked(resolveVenueId);
const getByIdMock = vi.mocked(reservationService.getById);

const reservation = { id: "res_1", venueId: "venue_1", guestEmail: "jane@example.com" };

describe("manageTokenScoped", () => {
  let app: FastifyInstance;
  const handler = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    resolveMock.mockResolvedValue("venue_1");
    getByIdMock.mockResolvedValue(reservation as never);
    app = Fastify();
    app.decorate("services", { reservationService } as unknown as DomainServices);
    const wrapped = manageTokenScoped(
      {
        missing: (reply) =>
          reply
            .status(418)
            .send({ type: "about:blank", title: "Missing", status: 418, detail: "missing" }),
      },
      async (_request, reply, scope) => {
        handler(scope, getCurrentVenueId());
        return reply.status(200).send({ ok: true });
      }
    );
    app.get("/manage", wrapped);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (token?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url: token ? `/manage?token=${token}` : "/manage", headers });
  const goodToken = () => generateManageToken("res_1", "jane@example.com");

  it("resolves the venue once and loads the reservation once, handing both to the handler", async () => {
    const token = goodToken();
    const response = await get(token);

    expect(response.statusCode).toBe(200);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock).toHaveBeenCalledWith("reservation", "res_1");
    expect(getByIdMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { venueId: "venue_1", reservation, token },
      "venue_1" // runWithVenueContext is set around the handler
    );
  });

  it("accepts the token from an Authorization: Bearer header", async () => {
    const response = await get(undefined, { authorization: `Bearer ${goodToken()}` });
    expect(response.statusCode).toBe(200);
  });

  it("400s a missing token without resolving anything", async () => {
    const response = await get();
    expect(response.statusCode).toBe(400);
    expect(response.json().title).toBe("Missing Token");
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("401s a malformed token without resolving anything", async () => {
    const response = await get("garbage");
    expect(response.statusCode).toBe(401);
    expect(response.json().title).toBe("Invalid Token");
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("delegates to `missing` when the venue does not resolve, loading nothing", async () => {
    resolveMock.mockResolvedValue(null);
    const response = await get(goodToken());
    expect(response.statusCode).toBe(418);
    expect(getByIdMock).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("delegates to `missing` when the venue resolves but the reservation is gone", async () => {
    getByIdMock.mockResolvedValue(null as never);
    const response = await get(goodToken());
    expect(response.statusCode).toBe(418);
    expect(handler).not.toHaveBeenCalled();
  });

  it("403s a token whose email does not match the reservation", async () => {
    getByIdMock.mockResolvedValue({ ...reservation, guestEmail: "someone@else.com" } as never);
    const response = await get(goodToken());
    expect(response.statusCode).toBe(403);
    expect(response.json().detail).toBe("Token does not match reservation");
    expect(handler).not.toHaveBeenCalled();
  });

  it("stamps a descriptor so the venue-scope registry sees the route", () => {
    const wrapped = manageTokenScoped({ missing: (reply) => reply }, async () => undefined);
    expect(venueScopeOf(wrapped)).toBe("token:manage/public");
  });
});

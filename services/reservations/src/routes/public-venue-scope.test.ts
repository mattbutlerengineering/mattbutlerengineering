import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { AppError } from "@mbe/types";
import { getCurrentVenueId } from "../services/venue-context-store.js";

vi.mock("../services/resolve-venue.js", () => ({ resolveVenueId: vi.fn() }));

const { resolveVenueId } = await import("../services/resolve-venue.js");
const { publicVenueScoped } = await import("./public-venue-scope.js");
const { venueScopeOf } = await import("./venue-scope.js");

const resolveMock = vi.mocked(resolveVenueId);

async function appWith(
  notFound?: Parameters<typeof publicVenueScoped>[0]["notFound"],
  before?: Parameters<typeof publicVenueScoped>[0]["before"]
) {
  const app = Fastify();
  const seen = vi.fn();
  app.get(
    "/v/:slug",
    publicVenueScoped(
      { slug: (request) => (request.params as { slug: string }).slug, notFound, before },
      async (_request, reply, scope) => {
        seen(scope, getCurrentVenueId());
        return reply.send({ ok: true });
      }
    )
  );
  await app.ready();
  return { app, seen };
}

describe("publicVenueScoped", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the slug once and runs the handler inside that venue's context", async () => {
    resolveMock.mockResolvedValue("venue_1");
    const { app, seen } = await appWith();
    const response = await app.inject({ url: "/v/oak" });

    expect(response.statusCode).toBe(200);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock).toHaveBeenCalledWith("venue_slug", "oak");
    expect(seen).toHaveBeenCalledWith({ venueId: "venue_1", slug: "oak" }, "venue_1");
  });

  it("answers 404 with the default problem body when the slug is unknown", async () => {
    resolveMock.mockResolvedValue(null);
    const { app, seen } = await appWith();
    const response = await app.inject({ url: "/v/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      status: 404,
      title: "Not Found",
      detail: "No venue found with slug 'nope'.",
    });
    expect(seen).not.toHaveBeenCalled();
  });

  it("lets a route keep its own 404 bytes", async () => {
    resolveMock.mockResolvedValue(null);
    const { app } = await appWith(() => ({ title: "Venue Not Found", detail: "Venue not found" }));
    const body = (await app.inject({ url: "/v/nope" })).json();
    expect(body).toMatchObject({ title: "Venue Not Found", detail: "Venue not found" });
  });

  it("runs `before` ahead of the venue resolve and stops when it replies", async () => {
    resolveMock.mockResolvedValue("venue_1");
    const { app, seen } = await appWith(undefined, (_request, reply) =>
      reply.code(429).send({ type: "about:blank", title: "Too Many", status: 429, detail: "cap" })
    );
    const response = await app.inject({ url: "/v/oak" });

    expect(response.statusCode).toBe(429);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });

  it("stops on `before`'s returned reply even behind two async onSend hooks", async () => {
    resolveMock.mockResolvedValue("venue_1");
    const app = Fastify();
    const seen = vi.fn();
    for (const name of ["x-a", "x-b"]) {
      app.addHook("onSend", async (_request, reply) => {
        reply.header(name, "1");
      });
    }
    app.get(
      "/v/:slug",
      publicVenueScoped(
        {
          slug: (request) => (request.params as { slug: string }).slug,
          before: (_request, reply) => {
            reply
              .code(401)
              .send({ type: "about:blank", title: "Unauthorized", status: 401, detail: "x" });
            return reply;
          },
        },
        async (_request, reply) => {
          seen();
          return reply.send({ ok: true });
        }
      )
    );
    await app.ready();
    const response = await app.inject({ url: "/v/oak" });

    expect(response.statusCode).toBe(401);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });

  it("continues to the resolve when `before` does not reply", async () => {
    resolveMock.mockResolvedValue("venue_1");
    const { app } = await appWith(undefined, () => undefined);
    expect((await app.inject({ url: "/v/oak" })).statusCode).toBe(200);
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  it("lets a route throw an AppError instead", async () => {
    resolveMock.mockResolvedValue(null);
    const { app } = await appWith((slug) => new AppError("VENUE_NOT_FOUND", 404, `x ${slug}`));
    const response = await app.inject({ url: "/v/nope" });
    expect(response.statusCode).toBe(404);
  });

  it("stamps a descriptor so the venue-scope registry sees the route", () => {
    const wrapped = publicVenueScoped({ slug: () => "x" }, async () => undefined);
    expect(venueScopeOf(wrapped)).toBe("slug/public");
  });
});

import { describe, expectTypeOf, it } from "vitest";
import Fastify from "fastify";
import { guestsEndpoints } from "@mbe/types";
import { registerEndpoint } from "@mbe/service-bootstrap";
import { venueScoped, type VenueScope } from "./venue-scope.js";

/**
 * Type-inference spike (docs/fixes/venue-scoped-routes/breakdown.md, PR 1).
 * `venueScoped` must infer the route generic from the slot it is passed to,
 * so a migrated route keeps today's typed `request.params`/`body`/`query`
 * with no explicit type arguments. These assertions are checked by `tsc`
 * (`pnpm typecheck` includes test files); at runtime they only register.
 */
describe("venueScoped type inference", () => {
  it("infers the route generic from fastify.post's handler slot", () => {
    const app = Fastify();
    app.post<{ Body: { venueId: string; name: string } }>(
      "/things",
      {},
      venueScoped({ venue: "body" }, async (request, _reply, scope) => {
        expectTypeOf(request.body.name).toEqualTypeOf<string>();
        expectTypeOf(scope).toEqualTypeOf<VenueScope<undefined>>();
        return { ok: true };
      })
    );
  });

  it("types scope.entity from the entity source's load", () => {
    const app = Fastify();
    app.get<{ Params: { id: string } }>(
      "/things/:id",
      {},
      venueScoped(
        {
          venue: {
            entity: "table",
            key: (request) => request.params.id,
            load: async (id: string) => ({ id, capacity: 4 }),
            notFound: "Table not found",
          },
        },
        async (request, _reply, scope) => {
          expectTypeOf(request.params.id).toEqualTypeOf<string>();
          expectTypeOf(scope.entity).toEqualTypeOf<{ id: string; capacity: number }>();
          return { data: scope.entity };
        }
      )
    );
  });

  it("infers the endpoint's route generic in registerEndpoint's handler slot", () => {
    const app = Fastify();
    registerEndpoint(app, guestsEndpoints.get, {
      docs: { summary: "spike" },
      handler: venueScoped(
        {
          venue: {
            entity: "guest",
            key: (request) => request.params.id,
            notFound: "Guest not found",
          },
        },
        async (request, reply) => {
          expectTypeOf(request.params.id).toEqualTypeOf<string>();
          return reply.code(404).send({
            type: "about:blank",
            title: "Not Found",
            status: 404,
            detail: "spike",
          });
        }
      ),
    });
  });
});

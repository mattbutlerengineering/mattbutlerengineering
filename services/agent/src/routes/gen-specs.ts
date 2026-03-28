import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { z } from "zod";
import { storedSpecService, mapStoredSpec } from "../services/stored-spec.js";

const CreateSpecBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  spec: z.unknown(),
  rawLines: z.array(z.string()),
});

export const genSpecsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/gen/specs — create and persist a spec (auth required)
  fastify.post(
    "/api/gen/specs",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const parseResult = CreateSpecBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: parseResult.error.issues.map((i) => i.message).join(", "),
          statusCode: 400,
        });
      }

      const { prompt, spec, rawLines } = parseResult.data;

      const result = await storedSpecService.create({
        userId: request.user!.id,
        prompt,
        spec,
        rawLines,
      });

      return reply.code(201).send({ data: mapStoredSpec(result) });
    }
  );

  // GET /api/gen/specs — list user's specs sorted by createdAt DESC (auth required)
  fastify.get(
    "/api/gen/specs",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const results = await storedSpecService.list(request.user!.id);
      return reply.code(200).send({ data: results.map(mapStoredSpec) });
    }
  );

  // GET /api/gen/specs/:id — PUBLIC — no auth required for permalink viewing
  fastify.get(
    "/api/gen/specs/:id",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await storedSpecService.getById(id);

      if (!result) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Spec not found",
          statusCode: 404,
        });
      }

      return reply.code(200).send({ data: mapStoredSpec(result) });
    }
  );

  // PATCH /api/gen/specs/:id/favorite — toggle isFavorite for the owner (auth required)
  fastify.patch(
    "/api/gen/specs/:id/favorite",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await storedSpecService.toggleFavorite(id, request.user!.id);
        return reply.code(200).send({ data: mapStoredSpec(result) });
      } catch (err) {
        if (err instanceof Error && err.message === "Not found") {
          return reply.code(404).send({
            error: "Not Found",
            message: "Spec not found",
            statusCode: 404,
          });
        }
        throw err;
      }
    }
  );

  // DELETE /api/gen/specs/:id — remove a spec for the owner (auth required)
  fastify.delete(
    "/api/gen/specs/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        await storedSpecService.delete(id, request.user!.id);
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof Error && err.message === "Not found") {
          return reply.code(404).send({
            error: "Not Found",
            message: "Spec not found",
            statusCode: 404,
          });
        }
        throw err;
      }
    }
  );
};

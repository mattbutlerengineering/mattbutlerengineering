import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
import { z } from "zod";
import { storedSpecService, mapStoredSpec, mapStoredSpecPublic } from "../services/stored-spec.js";

const GEN_SPEC_KINDS = ["generate", "refine", "recover", "failed"] as const;

// Tags old clients still prepend to the prompt instead of sending `kind`.
const LEGACY_PREFIXES: ReadonlyArray<readonly [string, (typeof GEN_SPEC_KINDS)[number]]> = [
  ["Refined: ", "refine"],
  ["Failed: ", "failed"],
  ["Recovered: ", "recover"],
];

// Mirrors apps/gen resolveEntry: an explicit kind wins; otherwise strip ONE legacy prefix.
function normaliseKind(
  prompt: string,
  kind: (typeof GEN_SPEC_KINDS)[number] | undefined
): { prompt: string; kind: (typeof GEN_SPEC_KINDS)[number] } {
  if (kind) return { prompt, kind };
  for (const [prefix, derived] of LEGACY_PREFIXES) {
    if (prompt.startsWith(prefix) && prompt.length > prefix.length) {
      return { prompt: prompt.slice(prefix.length), kind: derived };
    }
  }
  return { prompt, kind: "generate" };
}

const RefinementSchema = z.object({
  parentId: z.string().min(1).nullable(),
  path: z.string().min(1).max(200),
  before: z.unknown(),
  after: z.unknown(),
});

const CreateSpecBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  kind: z.enum(GEN_SPEC_KINDS).optional(),
  spec: z.unknown(),
  rawLines: z.array(z.string()),
  refinement: RefinementSchema.optional(),
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
        return reply
          .code(400)
          .send(
            createProblemDetails(
              400,
              "Bad Request",
              parseResult.error.issues.map((i) => i.message).join(", ")
            )
          );
      }

      const { spec, rawLines, refinement } = parseResult.data;
      const { prompt, kind } = normaliseKind(parseResult.data.prompt, parseResult.data.kind);

      if (refinement && kind !== "refine") {
        return reply
          .code(400)
          .send(
            createProblemDetails(400, "Bad Request", "refinement is only allowed on refine entries")
          );
      }

      try {
        const result = await storedSpecService.create({
          userId: request.user!.id,
          prompt,
          kind,
          spec,
          rawLines,
          refinement,
        });

        return reply.code(201).send({ data: mapStoredSpec(result) });
      } catch (err) {
        if (err instanceof Error && err.message === "Not found") {
          return reply
            .code(404)
            .send(createProblemDetails(404, "Not Found", "Parent spec not found"));
        }
        throw err;
      }
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
  fastify.get("/api/gen/specs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await storedSpecService.getById(id);

    if (!result) {
      return reply.code(404).send(createProblemDetails(404, "Not Found", "Spec not found"));
    }

    return reply.code(200).send({ data: mapStoredSpecPublic(result) });
  });

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
          return reply.code(404).send(createProblemDetails(404, "Not Found", "Spec not found"));
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
          return reply.code(404).send(createProblemDetails(404, "Not Found", "Spec not found"));
        }
        throw err;
      }
    }
  );
};

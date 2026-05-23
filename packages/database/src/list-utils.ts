interface ListQueryParams {
  page?: string;
  limit?: string;
}

interface ParsedListQuery {
  page: number;
  limit: number;
}

/**
 * Parse and sanitize pagination query string parameters.
 *
 * Defaults: page=1, limit=10. Clamps page to ≥1, limit to [1, 100].
 * Falls back to defaults for NaN, zero, or negative values.
 */
export function parseListQuery(query: ListQueryParams): ParsedListQuery {
  const rawPage = parseInt(query.page ?? "1", 10);
  const rawLimit = parseInt(query.limit ?? "10", 10);
  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
  const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 10 : rawLimit));
  return { page, limit };
}

interface ListResponseSchema {
  type: "object";
  properties: {
    data: {
      type: "array";
      items: { $ref: string };
    };
    pagination: { $ref: "Pagination#" };
  };
}

/**
 * Generate a Fastify JSON Schema object for a paginated list response.
 *
 * @param entityRef - The JSON Schema $ref string for the entity type (e.g. "User#")
 */
export function createListResponseSchema(entityRef: string): ListResponseSchema {
  return {
    type: "object",
    properties: {
      data: { type: "array", items: { $ref: entityRef } },
      pagination: { $ref: "Pagination#" },
    },
  };
}

export function parseListQuery(query: { page?: string; limit?: string }): {
  page: number;
  limit: number;
} {
  const rawPage = parseInt(query.page ?? "1", 10);
  const rawLimit = parseInt(query.limit ?? "10", 10);
  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
  const limit = Math.max(1, Math.min(100, isNaN(rawLimit) ? 10 : rawLimit));
  return { page, limit };
}

export function paginate(query: { page: number; limit: number }): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function toPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

const PAGINATION_PROPERTIES: Record<keyof PaginationMeta, { type: string }> = {
  page: { type: "number" },
  limit: { type: "number" },
  total: { type: "number" },
  totalPages: { type: "number" },
  hasNext: { type: "boolean" },
  hasPrev: { type: "boolean" },
};

export function createListResponseSchema(entityRef: string) {
  return {
    type: "object" as const,
    properties: {
      data: { type: "array" as const, items: { $ref: entityRef } },
      pagination: {
        type: "object" as const,
        properties: PAGINATION_PROPERTIES,
      },
    },
  };
}

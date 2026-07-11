import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

/**
 * Generic schema factory for paginated API responses.
 * Matches the PaginatedResponse<T> TypeScript type: { data: T[], pagination: {...} }.
 */
export function paginatedResponseSchema<T>(itemSchema: z.ZodSchema<T>) {
  return z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });
}

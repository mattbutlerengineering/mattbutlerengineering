import { z } from "zod";

export const ProblemDetailsSchema = z
  .object({
    type: z.string().url().or(z.literal("about:blank")),
    title: z.string(),
    status: z.number().int().min(100).max(599),
    detail: z.string(),
    instance: z.string().optional(),
  })
  .catchall(z.unknown());

/**
 * Legacy API error shape — used by the api-client and services for
 * backward compatibility. Includes both RFC 7807 fields (type, title,
 * status, detail) and the legacy fields (error, message, statusCode).
 */
export const ApiErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    statusCode: z.number(),
    details: z.record(z.string(), z.unknown()).optional(),
    // RFC 7807 compatibility (optional on legacy shape)
    type: z.string().optional(),
    title: z.string().optional(),
    status: z.number().optional(),
    detail: z.string().optional(),
    instance: z.string().optional(),
  })
  .catchall(z.unknown());

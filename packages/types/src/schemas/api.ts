import { z } from "zod";

export const ProblemDetailsSchema = z.object({
  type: z.string().url().or(z.literal("about:blank")),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string().optional(),
}).catchall(z.unknown());

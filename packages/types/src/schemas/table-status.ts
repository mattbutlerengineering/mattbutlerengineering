import { z } from "zod";

/** Zod mirror of `TableDisplayStatus` (see ../table-status.ts). */
export const TableDisplayStatusSchema = z.enum([
  "available",
  "seated",
  "needs-bussing",
  "reserved-soon",
]);

/** Zod mirror of `TableStatusDelta` (see ../table-status.ts). */
export const TableStatusDeltaSchema = z.object({
  tableId: z.string(),
  status: TableDisplayStatusSchema,
});

/**
 * A Manager's answer for one holiday that does not change the hours (docs/features/
 * availability-holidays-copy/architecture.md § A). Not availability config: the engine, the
 * config schema and the booking path never read it.
 */
import { z } from "zod";
import { ServiceDateSchema } from "./availability-config.js";

/** One answer today. A second answer is a new value here and no migration (the column is a string). */
export const HolidayDecisionKindSchema = z.enum(["open_as_usual"]);
export type HolidayDecisionKind = z.infer<typeof HolidayDecisionKindSchema>;

export const HolidayDecisionSchema = z.object({
  serviceDate: ServiceDateSchema,
  decision: HolidayDecisionKindSchema,
  /** ISO instant the decision was first made. */
  createdAt: z.string(),
});
export type HolidayDecision = z.infer<typeof HolidayDecisionSchema>;

/** Longest range `GET …/holiday-decisions` reads in one call, `from` to `to` inclusive. */
export const HOLIDAY_DECISIONS_MAX_RANGE = 400;

const MS_PER_DAY = 86_400_000;

/** The UTC midnight a service date names, or `null` when it is not a real calendar day. */
const dayMs = (date: string): number | null => {
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date ? null : ms;
};

/** Whether `date` is a real calendar day (`ServiceDateSchema` also lets `2026-02-31` through). */
export const isRealServiceDate = (date: string): boolean => dayMs(date) !== null;

/** Whether `from` to `to` is two real dates, `to` on or after `from`, at most the maximum days inclusive. */
export const isHolidayDecisionsRange = ({ from, to }: { from: string; to: string }): boolean => {
  const start = dayMs(from);
  const end = dayMs(to);
  if (start === null || end === null) return false;
  const days = (end - start) / MS_PER_DAY + 1;
  return days >= 1 && days <= HOLIDAY_DECISIONS_MAX_RANGE;
};

export const HolidayDecisionsQuerySchema = z
  .object({ from: ServiceDateSchema, to: ServiceDateSchema })
  .refine(isHolidayDecisionsRange, {
    message: `\`from\` and \`to\` must be real dates, \`to\` on or after \`from\`, at most ${HOLIDAY_DECISIONS_MAX_RANGE} days in all.`,
  });

export const SetHolidayDecisionBodySchema = z.object({ decision: HolidayDecisionKindSchema });

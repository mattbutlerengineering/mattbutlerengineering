import { prisma } from "./database.js";

/**
 * Aggregate daily spend ceiling for the `/api/gen/*` routes (#7234, part of #6948).
 *
 * Every other gen guard is per-identity or per-IP; none bounds the total that
 * gets billed. Spend is accumulated in Postgres (`gen_spend_windows`, one row
 * per UTC day) rather than in-process: the service runs several instances, and
 * an in-process counter would enforce `ceiling x instances`.
 */

/**
 * Used when `GEN_DAILY_CEILING_USD` is unset or unparseable, so a deployment
 * that forgets the variable is more restrictive, never less. ~2 saturated
 * users at the 2048-output-token cap; adjust via the env var, not this constant.
 */
export const GEN_DAILY_CEILING_DEFAULT_USD = 2;

/** Haiku 5.5 rates, USD per MTok (see GEN_MODEL_ID in gen-stream.ts). */
const INPUT_PER_MTOK = 0.1;
const OUTPUT_PER_MTOK = 0.5;
const CACHE_READ_PER_MTOK = 0.01;
const CACHE_WRITE_PER_MTOK = 0.125;

/** Parses the env value; anything but a finite number >= 0 yields the default. */
export function resolveGenDailyCeilingUsd(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return GEN_DAILY_CEILING_DEFAULT_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : GEN_DAILY_CEILING_DEFAULT_USD;
}

export function getGenDailyCeilingUsd(): number {
  return resolveGenDailyCeilingUsd(process.env.GEN_DAILY_CEILING_USD);
}

/**
 * Actual cost of one generation in micro-USD, from the reported token counts.
 * `inputTokens` includes cached tokens, so fresh input is the remainder after
 * cache reads and writes; cache reads bill at a tenth of base input.
 */
export function genCostMicroUsd(
  usage: { readonly inputTokens?: number; readonly outputTokens?: number },
  providerMetadata: unknown
): number {
  const meta = (
    providerMetadata as
      | { anthropic?: { cacheCreationInputTokens?: number; cacheReadInputTokens?: number } }
      | undefined
  )?.anthropic;
  const read = meta?.cacheReadInputTokens ?? 0;
  const write = meta?.cacheCreationInputTokens ?? 0;
  const fresh = Math.max(0, (usage.inputTokens ?? 0) - read - write);
  const usd =
    (fresh * INPUT_PER_MTOK +
      read * CACHE_READ_PER_MTOK +
      write * CACHE_WRITE_PER_MTOK +
      (usage.outputTokens ?? 0) * OUTPUT_PER_MTOK) /
    1_000_000;
  return Math.round(usd * 1_000_000);
}

function windowDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function secondsUntilNextWindow(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export interface GenSpend {
  readonly generations: number;
  readonly costMicroUsd: number;
}

export async function getGenSpendToday(now: Date = new Date()): Promise<GenSpend> {
  const rows = await prisma.$queryRaw<
    Array<{ generations: number; cost_micro_usd: bigint | number }>
  >`SELECT generations, cost_micro_usd FROM gen_spend_windows WHERE window_date = ${windowDate(now)}::date`;
  const row = rows[0];
  if (!row) return { generations: 0, costMicroUsd: 0 };
  return { generations: Number(row.generations), costMicroUsd: Number(row.cost_micro_usd) };
}

/** Adds one generation's actual cost to today's window in a single atomic upsert. */
export async function recordGenSpend(costMicroUsd: number, now: Date = new Date()): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO gen_spend_windows (window_date, generations, cost_micro_usd)
    VALUES (${windowDate(now)}::date, 1, ${costMicroUsd})
    ON CONFLICT (window_date) DO UPDATE
    SET generations = gen_spend_windows.generations + 1,
        cost_micro_usd = gen_spend_windows.cost_micro_usd + EXCLUDED.cost_micro_usd`;
}

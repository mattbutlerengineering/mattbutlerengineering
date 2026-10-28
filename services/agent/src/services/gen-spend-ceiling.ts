import type { FastifyBaseLogger } from "fastify";
import { prisma } from "./database.js";
import { GEN_MAX_OUTPUT_TOKENS, GEN_PRICING, cacheTokens } from "../routes/gen-stream.js";

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
 * that forgets the variable is more restrictive, never less. $0.50/day is
 * about $15/month, the budget #6948 suggests; adjust via the env var, not this constant.
 */
export const GEN_DAILY_CEILING_DEFAULT_USD = 0.5;

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
  usage: Parameters<typeof cacheTokens>[0],
  providerMetadata: unknown
): number {
  const { read, write } = cacheTokens(usage, providerMetadata);
  const fresh = Math.max(0, (usage.inputTokens ?? 0) - read - write);
  const usd =
    (fresh * GEN_PRICING.input +
      read * GEN_PRICING.cacheRead +
      write * GEN_PRICING.cacheWrite +
      (usage.outputTokens ?? 0) * GEN_PRICING.output) /
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

/**
 * Worst-case charge for a generation that failed before `onFinish` reported
 * usage: the full output cap. Failed runs (including the by-design `length`
 * truncation) still consume tokens, and would otherwise be invisible.
 */
export function failedGenCostMicroUsd(): number {
  return Math.round(GEN_MAX_OUTPUT_TOKENS * GEN_PRICING.output);
}

/** Consecutive usage-write failures after which the guard refuses instead of going blind. */
export const GEN_WRITE_FAILURE_LIMIT = 3;
let consecutiveWriteFailures = 0;

/**
 * While degraded, one request per this interval is let through as a probe; its
 * write heals or re-latches. 5 min keeps a permanent write outage near the
 * default daily ceiling. The worst case is the output cap, about $0.002 a probe.
 * Known limit: probe state is per instance, so N instances multiply this by N.
 */
export const GEN_DEGRADED_PROBE_MS = 300_000;
let lastProbeAt = 0;

export function isSpendTrackingDegraded(now: number = Date.now()): boolean {
  if (consecutiveWriteFailures < GEN_WRITE_FAILURE_LIMIT) return false;
  if (lastProbeAt === 0) lastProbeAt = now;
  if (now - lastProbeAt < GEN_DEGRADED_PROBE_MS) return true;
  lastProbeAt = now;
  return false;
}

export function resetSpendTrackingForTests(): void {
  consecutiveWriteFailures = 0;
  lastProbeAt = 0;
}

/**
 * Records usage and tracks write health. A persistent write failure would stop
 * the counter rising and silently disable the ceiling, so past the limit the
 * route refuses (reads already fail closed; writes must too).
 */
export async function trackGenSpend(
  costMicroUsd: number,
  log: Pick<FastifyBaseLogger, "error">
): Promise<void> {
  try {
    await recordGenSpend(costMicroUsd);
    consecutiveWriteFailures = 0;
    lastProbeAt = 0;
  } catch (err) {
    consecutiveWriteFailures++;
    log.error({ err, consecutiveWriteFailures }, "gen spend ceiling: failed to record usage");
  }
}

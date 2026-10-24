import { createHash } from "node:crypto";
import { prisma } from "./database.js";

/**
 * Postgres-backed cache of generated specs, keyed by a hash of every input that
 * can change the output (#7231, part of #6948). Postgres rather than in-process
 * because the service runs several instances: a per-instance cache would only
 * hit 1/instances of the time.
 */

/** Cached rows older than this are ignored on read and swept on write. */
export const GEN_SPEC_CACHE_TTL_HOURS = 24;

export interface GenSpecCacheKeyInput {
  readonly route: string;
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  readonly modelId: string;
  /**
   * The full system prompt. It embeds `catalog.prompt()`, so it changes whenever
   * the catalog does — derived from the catalog, never a hand-kept version.
   */
  readonly systemPrompt: string;
  readonly maxOutputTokens: number;
}

const normalize = (text: string) => text.trim().replace(/\s+/g, " ");

export function genSpecCacheKey(input: GenSpecCacheKeyInput): string {
  // JSON framing keeps field and message boundaries unambiguous.
  const payload = JSON.stringify([
    input.route,
    input.modelId,
    createHash("sha256").update(input.systemPrompt).digest("hex"),
    input.maxOutputTokens,
    input.messages.map((m) => [m.role, normalize(m.content)]),
  ]);
  return createHash("sha256").update(payload).digest("hex");
}

/** Returns the cached NDJSON line values for `key`, or null on a miss or expired row. */
export async function getCachedSpec(key: string): Promise<unknown[] | null> {
  const rows = await prisma.$queryRaw<Array<{ lines: unknown[] }>>`
    SELECT lines FROM gen_spec_cache
    WHERE key = ${key}
      AND created_at > now() - make_interval(hours => ${GEN_SPEC_CACHE_TTL_HOURS}::int)`;
  return rows[0]?.lines ?? null;
}

/** Stores a successful run's lines and sweeps expired rows. */
export async function putCachedSpec(key: string, lines: unknown[]): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO gen_spec_cache (key, lines, created_at)
    VALUES (${key}, ${JSON.stringify(lines)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET lines = EXCLUDED.lines, created_at = now()`;
  await prisma.$executeRaw`
    DELETE FROM gen_spec_cache
    WHERE created_at <= now() - make_interval(hours => ${GEN_SPEC_CACHE_TTL_HOURS}::int)`;
}

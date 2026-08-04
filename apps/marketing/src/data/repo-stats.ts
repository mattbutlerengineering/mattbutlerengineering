import fallbackSnapshot from "./repo-stats.fallback.json";

/**
 * Live repository measurements backing the landing "proof strip".
 *
 * Produced at build time by `scripts/collect-repo-stats.mjs`.
 */
export interface RepoStats {
  /** Merged pull requests carrying the `agent-authored` audit label. */
  readonly agentPrsMerged: number;
  /** Merged pull requests in total. */
  readonly totalPrsMerged: number;
  /** Component folders in `packages/rialto/src/components`. */
  readonly rialtoComponents: number;
  /** Git-tracked `*.test.*` / `*.spec.*` files. */
  readonly testFiles: number;
  /** ISO timestamp of the measurement. */
  readonly measuredAt: string;
}

const COUNTER_KEYS = [
  "agentPrsMerged",
  "totalPrsMerged",
  "rialtoComponents",
  "testFiles",
] as const satisfies readonly (keyof RepoStats)[];

/**
 * Runtime guard for a snapshot that crossed a file boundary. The generated file
 * is written by a build script that can be interrupted or run by an older
 * revision, so its shape is validated rather than trusted.
 */
export function isRepoStats(value: unknown): value is RepoStats {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;

  const countersValid = COUNTER_KEYS.every((key) => {
    const count = candidate[key];
    return typeof count === "number" && Number.isInteger(count) && count >= 0;
  });
  if (!countersValid) return false;

  const { measuredAt } = candidate;
  return typeof measuredAt === "string" && !Number.isNaN(Date.parse(measuredAt));
}

/** Committed snapshot — the floor the site renders when no fresh data exists. */
export const FALLBACK_REPO_STATS: RepoStats = fallbackSnapshot;

/**
 * Prefer freshly generated numbers, but only when they are well-formed.
 *
 * @param generated - Contents of the gitignored generated snapshot, if any.
 * @param fallback - Committed snapshot to fall back to.
 */
export function selectRepoStats(generated: unknown, fallback: RepoStats): RepoStats {
  return isRepoStats(generated) ? generated : fallback;
}

/**
 * `import.meta.glob` resolves to `{}` when the generated file is absent, which
 * keeps `tsc -b` and an offline `vite build` working on a fresh clone — unlike a
 * static import of a gitignored path.
 */
const generatedSnapshots = import.meta.glob<{ default: unknown }>("./generated/repo-stats.json", {
  eager: true,
});

/** Numbers the proof strip renders. Always valid, online or off. */
export const REPO_STATS: RepoStats = selectRepoStats(
  Object.values(generatedSnapshots)[0]?.default,
  FALLBACK_REPO_STATS
);

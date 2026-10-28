import fallbackSnapshot from "./repo-stats.fallback.json";
import componentCountFallback from "./rialto-component-count.fallback.json";

/**
 * Live repository measurements backing the landing "proof strip".
 *
 * PR/test numbers are produced at build time by `scripts/collect-repo-stats.mjs`.
 * The Rialto component count is NOT measured there: it has its own source (the
 * compiled manifest, see `scripts/rialto-component-count.mjs`) so every
 * surface advertises the same number (#7548).
 */
export interface RepoStats {
  /** Merged pull requests carrying the `agent-authored` audit label. */
  readonly agentPrsMerged: number;
  /** Merged pull requests in total. */
  readonly totalPrsMerged: number;
  /** Entries in Rialto's compiled manifest — the one definition of "component". */
  readonly rialtoComponents: number;
  /** Git-tracked `*.test.*` / `*.spec.*` files. */
  readonly testFiles: number;
  /** ISO timestamp of the measurement. */
  readonly measuredAt: string;
}

/** Fields the collector script measures (everything but the component count). */
export type MeasuredStats = Omit<RepoStats, "rialtoComponents">;

const COUNTER_KEYS = [
  "agentPrsMerged",
  "totalPrsMerged",
  "testFiles",
] as const satisfies readonly (keyof MeasuredStats)[];

/**
 * Runtime guard for a snapshot that crossed a file boundary. The generated file
 * is written by a build script that can be interrupted or run by an older
 * revision, so its shape is validated rather than trusted.
 */
export function isMeasuredStats(value: unknown): value is MeasuredStats {
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
export const FALLBACK_REPO_STATS: MeasuredStats = fallbackSnapshot;

/**
 * Prefer freshly generated numbers, but only when they are well-formed.
 *
 * @param generated - Contents of the gitignored generated snapshot, if any.
 * @param fallback - Committed snapshot to fall back to.
 */
export function selectMeasuredStats(generated: unknown, fallback: MeasuredStats): MeasuredStats {
  return isMeasuredStats(generated) ? generated : fallback;
}

/** Prefer the manifest-derived count written at prebuild, else the committed one. */
export function selectComponentCount(generated: unknown, fallback: number): number {
  const count =
    typeof generated === "object" && generated !== null
      ? (generated as { rialtoComponents?: unknown }).rialtoComponents
      : undefined;
  return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : fallback;
}

/**
 * `import.meta.glob` resolves to `{}` when the generated file is absent, which
 * keeps `tsc -b` and an offline `vite build` working on a fresh clone — unlike a
 * static import of a gitignored path.
 */
const generatedSnapshots = import.meta.glob<{ default: unknown }>("./generated/repo-stats.json", {
  eager: true,
});

const generatedComponentCounts = import.meta.glob<{ default: unknown }>(
  "./generated/rialto-component-count.json",
  { eager: true }
);

/** The single advertised Rialto component count (project card, proof strip, factory). */
export const RIALTO_COMPONENT_COUNT: number = selectComponentCount(
  Object.values(generatedComponentCounts)[0]?.default,
  componentCountFallback.rialtoComponents
);

/** Numbers the proof strip renders. Always valid, online or off. */
export const REPO_STATS: RepoStats = {
  ...selectMeasuredStats(Object.values(generatedSnapshots)[0]?.default, FALLBACK_REPO_STATS),
  rialtoComponents: RIALTO_COMPONENT_COUNT,
};

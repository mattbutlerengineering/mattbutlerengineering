import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export interface FileSize {
  readonly path: string;
  readonly bytes: number;
}

export interface BundleSizeEntry {
  readonly app: string;
  readonly totalBytes: number;
  readonly files: readonly FileSize[];
  readonly timestamp: string;
}

export interface BundleSizeBaseline {
  readonly entries: readonly BundleSizeEntry[];
  readonly updatedAt: string;
  readonly version: number;
}

export interface BundleSizeComparison {
  readonly app: string;
  readonly previousBytes: number;
  readonly currentBytes: number;
  readonly deltaBytes: number;
  readonly deltaPercent: number;
  readonly regression: boolean;
}

export interface BundleSizeReport {
  readonly comparisons: readonly BundleSizeComparison[];
  readonly hasRegressions: boolean;
  readonly summary: string;
}

// ── Constants ───────────────────────────────────────────────────────

const BASELINE_VERSION = 1;
const DEFAULT_THRESHOLD_PERCENT = 10;

// ── Functions ───────────────────────────────────────────────────────

export async function measureAppBundleSize(
  distPath: string,
  appName: string
): Promise<BundleSizeEntry> {
  const allEntries = await readdir(distPath, { recursive: true });

  const fileSizes: FileSize[] = [];
  let totalBytes = 0;

  for (const entry of allEntries) {
    const fullPath = join(distPath, entry);
    const info = await stat(fullPath);
    if (!info.isFile()) continue;

    const bytes = info.size;
    totalBytes += bytes;
    fileSizes.push({ path: entry, bytes });
  }

  return {
    app: appName,
    totalBytes,
    files: fileSizes,
    timestamp: new Date().toISOString(),
  };
}

export async function measureAllBundles(rootDir: string): Promise<readonly BundleSizeEntry[]> {
  const appsDir = join(rootDir, "apps");
  const appDirs = await readdir(appsDir);

  const entries: BundleSizeEntry[] = [];

  for (const appDir of appDirs) {
    const distPath = join(appsDir, appDir, "dist");
    try {
      const info = await stat(distPath);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    const entry = await measureAppBundleSize(distPath, appDir);
    entries.push(entry);
  }

  return [...entries].sort((a, b) => a.app.localeCompare(b.app));
}

export async function loadBaseline(baselinePath: string): Promise<BundleSizeBaseline | null> {
  try {
    const raw = await readFile(baselinePath, "utf-8");
    const parsed = JSON.parse(raw) as BundleSizeBaseline;
    if (parsed.version !== BASELINE_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBaseline(
  baselinePath: string,
  entries: readonly BundleSizeEntry[]
): Promise<void> {
  const baseline: BundleSizeBaseline = {
    entries,
    updatedAt: new Date().toISOString(),
    version: BASELINE_VERSION,
  };

  await mkdir(dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf-8");
}

function buildComparison(
  app: string,
  currentBytes: number,
  previousBytes: number,
  thresholdPercent: number
): BundleSizeComparison {
  const deltaBytes = currentBytes - previousBytes;
  const deltaPercent = previousBytes === 0 ? 0 : (deltaBytes / previousBytes) * 100;
  const regression = deltaPercent > thresholdPercent;

  return { app, previousBytes, currentBytes, deltaBytes, deltaPercent, regression };
}

export function compareWithBaseline(
  current: readonly BundleSizeEntry[],
  baseline: BundleSizeBaseline | null,
  thresholdPercent: number = DEFAULT_THRESHOLD_PERCENT
): BundleSizeReport {
  const baselineMap = new Map<string, number>();
  if (baseline) {
    for (const entry of baseline.entries) {
      baselineMap.set(entry.app, entry.totalBytes);
    }
  }

  const comparisons: BundleSizeComparison[] = current.map((entry) => {
    const previousBytes = baselineMap.get(entry.app) ?? 0;
    return buildComparison(entry.app, entry.totalBytes, previousBytes, thresholdPercent);
  });

  const hasRegressions = comparisons.some((c) => c.regression);

  const lines: string[] = [];
  for (const c of comparisons) {
    const prev = baselineMap.has(c.app) ? formatKB(c.previousBytes) : "new";
    const delta =
      c.previousBytes === 0
        ? "new"
        : `${c.deltaPercent >= 0 ? "+" : ""}${c.deltaPercent.toFixed(1)}%`;
    const status = c.regression ? "REGRESSION" : "ok";
    lines.push(`${c.app}: ${prev} → ${formatKB(c.currentBytes)} (${delta}) ${status}`);
  }

  const summary = hasRegressions
    ? `Bundle size regressions detected:\n${lines.join("\n")}`
    : `All bundle sizes within threshold:\n${lines.join("\n")}`;

  return { comparisons, hasRegressions, summary };
}

export function formatReport(report: BundleSizeReport): string {
  const header = "App                  | Before     | After      | Delta       | Status";
  const separator = "---------------------+------------+------------+-------------+-----------";

  const rows = report.comparisons.map((c) => {
    const app = c.app.padEnd(20);
    const before =
      c.previousBytes === 0 ? "—".padStart(10) : formatKB(c.previousBytes).padStart(10);
    const after = formatKB(c.currentBytes).padStart(10);
    const delta =
      c.previousBytes === 0
        ? "new".padStart(11)
        : `${c.deltaPercent >= 0 ? "+" : ""}${c.deltaPercent.toFixed(1)}%`.padStart(11);
    const status = c.regression ? "REGRESSION" : "ok";
    return `${app} | ${before} | ${after} | ${delta} | ${status}`;
  });

  return [header, separator, ...rows].join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

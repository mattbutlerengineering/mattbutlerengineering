/**
 * ui-quality-capture — the shared half of every app's ui-quality capture spec
 * (docs/features/ui-quality-loop/architecture.md § Components "Capture",
 * § Interfaces "Capture spec").
 *
 * `capturePage(page, route, opts)` visits one planned route and returns its
 * `manifest.jsonl` row: a screenshot per viewport (written to `opts.outDir`,
 * `file` relative to it, i.e. to the manifest), the full axe-core result
 * (every impact, `color-contrast` on), uncaught page errors, console errors,
 * failed same-origin requests, same-origin links, and a blank-render measure.
 * It never throws: a route that fails to load (or whose axe run fails) still
 * yields a row, carrying `error`, so `ledger.mjs record` can mark it.
 *
 * Lives in `@mbe/test-fixtures` because dependency-cruiser's
 * `apps-not-imported` rule keeps capture inside each app's e2e boundary
 * (hospitality needs its own `mockApi`), so the shared logic has to be a
 * workspace package. Import only from e2e code:
 * `@mbe/test-fixtures/ui-quality-capture`.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";

export interface Viewport {
  width: number;
  height: number;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: unknown }>;
}

export interface ManifestRow {
  route: string;
  path: string;
  screenshots: Array<{ viewport: string; file: string; sha256: string }>;
  axe: { violations: AxeViolation[] };
  page_errors: string[];
  console_errors: string[];
  failed_requests: Array<{ url: string; reason: string }>;
  links: string[];
  blank: { text_chars: number; painted_ratio: number };
  ms: number;
  error?: string;
}

/** The slice of Playwright's `Page` capture touches — a fake one drives the tests. */
export type CapturePageLike = Pick<
  Page,
  "emulateMedia" | "setViewportSize" | "goto" | "waitForLoadState" | "evaluate" | "screenshot"
> & {
  on(event: string, handler: (arg: never) => void): unknown;
  off(event: string, handler: (arg: never) => void): unknown;
};

interface RawAxe {
  violations: Array<{
    id: string;
    impact?: string | null;
    help: string;
    nodes: Array<{ target: unknown }>;
  }>;
}

export interface CaptureOptions {
  /** e.g. `http://127.0.0.1:4173` — the `vite preview` origin */
  baseUrl: string;
  /** the concrete path planned for this route (fixture-resolved) */
  path: string;
  /** `.ui-quality/captures/<app>/` — created if absent */
  outDir: string;
  viewports: readonly Viewport[];
  /** Runs axe on the loaded page. Defaults to `@axe-core/playwright`'s AxeBuilder. */
  analyzeAxe?: (page: CapturePageLike) => Promise<RawAxe>;
  /** Navigation timeout — one route's timeout fails only that row. */
  timeoutMs?: number;
}

const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 5_000;

/**
 * Runs in the page. A string, not a function, so this package needs no DOM
 * lib: main landmark text length, and the share of a 10×10 grid of viewport
 * points covered by something other than the root elements.
 */
const PROBE_SCRIPT = `(() => {
  const main = document.querySelector("main, [role=main]") || document.body;
  const text_chars = ((main && main.innerText) || "").trim().length;
  const w = window.innerWidth, h = window.innerHeight;
  let painted = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const el = document.elementFromPoint((i + 0.5) * w / 10, (j + 0.5) * h / 10);
    if (el && el !== document.documentElement && el !== document.body) painted++;
  }
  const hrefs = Array.from(document.querySelectorAll("a[href]"), (a) => a.href);
  return { hrefs, text_chars, painted_ratio: painted / 100 };
})()`;

interface Probe {
  hrefs: string[];
  text_chars: number;
  painted_ratio: number;
}

/** `baseUrl` with a trailing slash, so relative joins stay under the app's base path. */
const asBase = (baseUrl: string) => (baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

/**
 * In-app links: hrefs on the app's origin and under its base path, as sorted,
 * deduped app-relative pathnames (`/rialto/components/x` under `/rialto/` →
 * `/components/x`). External, other-app, non-http and unparseable hrefs are
 * dropped; query and fragment are ignored.
 */
export function sameOriginLinks(hrefs: readonly string[], baseUrl: string): string[] {
  const base = new URL(asBase(baseUrl));
  const paths = new Set<string>();
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
      paths.add(`/${url.pathname.slice(base.pathname.length)}`);
    }
  }
  return [...paths].sort();
}

export interface CapturePlan {
  entries: Array<{ route: string; path: string; viewports: Viewport[] }>;
  outDir: string;
  manifestPath: string;
}

/**
 * The app's slice of `$UI_QUALITY_PLAN` (`ledger.mjs due`'s
 * `.ui-quality/plan.json`, `{ app → [{ route, path, viewports }] }`). Captures
 * go beside the plan, in `captures/<app>/`. Read-only — Playwright loads a
 * spec file in the runner and again in every worker, so truncating here
 * would race the rows already written.
 */
export function loadCapturePlan(
  app: string,
  env: Record<string, string | undefined> = process.env
): CapturePlan {
  const planPath = env.UI_QUALITY_PLAN;
  const outDir = planPath ? join(dirname(planPath), "captures", app) : "";
  const none = { entries: [], outDir, manifestPath: join(outDir, "manifest.jsonl") };
  if (!planPath) return none;
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Record<string, CapturePlan["entries"]>;
  return { ...none, entries: plan[app] ?? [] };
}

/**
 * Start this run's manifest empty — only in the run's first worker
 * (`testInfo.workerIndex === 0`). Playwright replaces a worker after a failed
 * test with a new, higher index; that worker must append, not wipe.
 */
export function resetManifest(plan: CapturePlan, workerIndex: number): void {
  if (workerIndex !== 0 || plan.entries.length === 0) return;
  mkdirSync(plan.outDir, { recursive: true });
  writeFileSync(plan.manifestPath, "");
}

/** One JSONL line per captured route. */
export function appendManifestRow(plan: CapturePlan, row: ManifestRow): void {
  appendFileSync(plan.manifestPath, `${JSON.stringify(row)}\n`);
}

/** `book/:venueSlug` @ 1280×720 → `book-venueSlug@1280x720.png`; `/` → `root`, `*` → `not-found`. */
export function screenshotName(route: string, viewport: Viewport): string {
  const slug =
    route === "/"
      ? "root"
      : route === "*"
        ? "not-found"
        : route.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug}@${viewport.width}x${viewport.height}.png`;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function defaultAnalyzeAxe(page: CapturePageLike): Promise<RawAxe> {
  const { AxeBuilder } = await import("@axe-core/playwright");
  return new AxeBuilder({ page: page as unknown as Page }).analyze();
}

function trimAxe(raw: RawAxe): { violations: AxeViolation[] } {
  return {
    violations: raw.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target })),
    })),
  };
}

/** Subscribes to the page's failure events; returns the collected lists and an unsubscribe. */
function listen(page: CapturePageLike, origin: string) {
  const page_errors: string[] = [];
  const console_errors: string[] = [];
  const failed_requests: Array<{ url: string; reason: string }> = [];
  const sameOrigin = (url: string) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  const handlers: Record<string, (arg: never) => void> = {
    pageerror: (err: Error) => page_errors.push(err.message),
    console: (msg: { type(): string; text(): string }) => {
      if (msg.type() === "error") console_errors.push(msg.text());
    },
    requestfailed: (req: { url(): string; failure(): { errorText: string } | null }) => {
      if (sameOrigin(req.url())) {
        failed_requests.push({ url: req.url(), reason: req.failure()?.errorText ?? "failed" });
      }
    },
    response: (res: { url(): string; status(): number }) => {
      if (res.status() >= 400 && sameOrigin(res.url())) {
        failed_requests.push({ url: res.url(), reason: `HTTP ${res.status()}` });
      }
    },
  };
  for (const [event, handler] of Object.entries(handlers)) page.on(event, handler);
  const stop = () => {
    for (const [event, handler] of Object.entries(handlers)) page.off(event, handler);
  };
  return { page_errors, console_errors, failed_requests, stop };
}

async function screenshotAll(page: CapturePageLike, route: string, opts: CaptureOptions) {
  const shots: ManifestRow["screenshots"] = [];
  for (const viewport of opts.viewports) {
    await page.setViewportSize(viewport);
    const file = screenshotName(route, viewport);
    const path = join(opts.outDir, file);
    const bytes = await page.screenshot({ path, fullPage: true });
    shots.push({ viewport: `${viewport.width}x${viewport.height}`, file, sha256: sha256(bytes) });
  }
  return shots;
}

/** Visit one route and return its manifest row. Never throws. */
export async function capturePage(
  page: CapturePageLike,
  route: string,
  opts: CaptureOptions
): Promise<ManifestRow> {
  const started = Date.now();
  const origin = new URL(opts.baseUrl).origin;
  const events = listen(page, origin);
  const row: ManifestRow = {
    route,
    path: opts.path,
    screenshots: [],
    axe: { violations: [] },
    page_errors: events.page_errors,
    console_errors: events.console_errors,
    failed_requests: events.failed_requests,
    links: [],
    blank: { text_chars: 0, painted_ratio: 0 },
    ms: 0,
  };
  try {
    mkdirSync(opts.outDir, { recursive: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const [first] = opts.viewports;
    if (first) await page.setViewportSize(first);
    await page.goto(new URL(opts.path.replace(/^\/+/, ""), asBase(opts.baseUrl)).href, {
      waitUntil: "load",
      timeout: opts.timeoutMs ?? NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
    const probe = (await page.evaluate(PROBE_SCRIPT)) as Probe;
    row.links = sameOriginLinks(probe.hrefs, opts.baseUrl);
    row.blank = { text_chars: probe.text_chars, painted_ratio: probe.painted_ratio };
    row.axe = trimAxe(await (opts.analyzeAxe ?? defaultAnalyzeAxe)(page));
    row.screenshots = await screenshotAll(page, route, opts);
  } catch (err) {
    row.error = message(err);
  } finally {
    events.stop();
  }
  row.ms = Date.now() - started;
  return row;
}

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSentrySourcemaps, readDistFiles } from "../verify-sentry-sourcemaps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/deploy-static.yml"), "utf8");

// What sentryVitePlugin prepends to every chunk when it is enabled
// (@sentry/bundler-plugins core getDebugIdSnippet). Trimmed to the part the
// guard keys on; the uuid is arbitrary.
const INJECTED =
  ';{try{(function(){var e=typeof window!="undefined"?window:{};e._sentryDebugIdIdentifier="sentry-dbid-0b6d1c1e-3f1a-4a6e-9a1d-2f6c7c1d9e11";})();}catch(e){}};';
const PLAIN = 'console.log("hello");\n//# sourceMappingURL=index-abc.js.map\n';

const file = (path, content = "") => ({ path, content });

describe("evaluateSentrySourcemaps", () => {
  it("passes a dist whose chunks are all injected and whose maps are gone", () => {
    const result = evaluateSentrySourcemaps([
      file("index.html", "<html></html>"),
      file("assets/index-abc.js", INJECTED + PLAIN),
      file("assets/vendor-def.js", INJECTED + "export{};"),
      file("assets/index-abc.css", "body{}"),
    ]);
    expect(result).toEqual({ ok: true, checkedChunks: 2, problems: [] });
  });

  it("fails on a chunk without the debug-ID snippet and names it", () => {
    const result = evaluateSentrySourcemaps([
      file("assets/index-abc.js", INJECTED + PLAIN),
      file("assets/lazy-xyz.js", PLAIN),
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ kind: "missing-debug-id", path: "assets/lazy-xyz.js" }]);
  });

  it("fails on a source map left anywhere in dist", () => {
    const result = evaluateSentrySourcemaps([
      file("assets/index-abc.js", INJECTED + PLAIN),
      file("assets/index-abc.js.map", "{}"),
      file("sw.js.map", "{}"),
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      { kind: "leftover-map", path: "assets/index-abc.js.map" },
      { kind: "leftover-map", path: "sw.js.map" },
    ]);
  });

  it("reports every problem at once, not just the first", () => {
    const result = evaluateSentrySourcemaps([
      file("assets/a.js", PLAIN),
      file("assets/a.js.map", "{}"),
    ]);
    expect(result.problems.map((p) => p.kind)).toEqual(["missing-debug-id", "leftover-map"]);
  });

  it("fails when there are no chunks at all, so a wrong dist path cannot pass", () => {
    const result = evaluateSentrySourcemaps([file("index.html", "<html></html>")]);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ kind: "no-chunks", path: "assets/" }]);
  });

  it("only requires injection in vite's assets/ chunks, not PWA files at the dist root", () => {
    // vite-plugin-pwa writes registerSW.js and sw.js outside the rollup
    // bundle, after sentryVitePlugin has run, so they can never carry a debug
    // ID. Their maps are still checked by the leftover-map rule.
    const result = evaluateSentrySourcemaps([
      file("assets/index-abc.js", INJECTED),
      file("registerSW.js", "navigator.serviceWorker.register('/sw.js')"),
      file("sw.js", "self.define=1"),
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("readDistFiles", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verify-sentry-sourcemaps-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("walks the dist tree, returning posix paths relative to it", () => {
    mkdirSync(join(dir, "assets", "nested"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets", "index-abc.js"), INJECTED);
    writeFileSync(join(dir, "assets", "nested", "x.js.map"), "{}");

    const files = readDistFiles(dir).sort((a, b) => a.path.localeCompare(b.path));
    expect(files.map((f) => f.path)).toEqual([
      "assets/index-abc.js",
      "assets/nested/x.js.map",
      "index.html",
    ]);
    expect(files[0].content).toBe(INJECTED);
  });

  it("feeds a real fixture dir through the evaluation end to end", () => {
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "ok.js"), INJECTED);
    writeFileSync(join(dir, "assets", "bad.js"), PLAIN);
    writeFileSync(join(dir, "assets", "bad.js.map"), "{}");

    const result = evaluateSentrySourcemaps(readDistFiles(dir));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      { kind: "missing-debug-id", path: "assets/bad.js" },
      { kind: "leftover-map", path: "assets/bad.js.map" },
    ]);
  });

  it("throws on a dist dir that does not exist", () => {
    expect(() => readDistFiles(join(dir, "nope"))).toThrow();
  });
});

/** Same textual step splitting as deploy-static-sentry-env.test.mjs. */
function stepBlocks(yaml) {
  const lines = yaml.split("\n");
  const starts = lines.reduce((acc, line, index) => {
    if (/^\s*-\s+(name|run|uses):/.test(line)) acc.push(index);
    return acc;
  }, []);
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

function jobBlock(yaml, jobId) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line === `  ${jobId}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1).findIndex((line) => /^ {2}[A-Za-z0-9_-]+:/.test(line));
  const end = rest === -1 ? lines.length : start + 1 + rest;
  return lines.slice(start, end).join("\n");
}

/** Non-comment lines of a step, so a comment naming the script cannot satisfy a check. */
const codeLines = (step) => step.split("\n").filter((line) => !/^\s*#/.test(line));

describe("deploy-static.yml runs the guard between each build and its deploy", () => {
  it.each(["marketing", "hospitality", "rialto-web"])("deploy-%s", (app) => {
    const job = jobBlock(WORKFLOW, `deploy-${app}`);
    expect(job, `job deploy-${app} not found`).not.toBeNull();

    const steps = stepBlocks(job);
    const buildIndex = steps.findIndex((s) => s.includes(`pnpm build --filter=@mbe/${app}`));
    const guardIndex = steps.findIndex((s) =>
      codeLines(s).some((line) => {
        const tokens = line.trim().split(/\s+/);
        return (
          tokens.includes("scripts/verify-sentry-sourcemaps.mjs") &&
          tokens.includes(`apps/${app}/dist`)
        );
      })
    );
    const deployIndex = steps.findIndex((s) =>
      s.includes(`wrangler@3.114.17 deploy --config apps/${app}/wrangler.toml`)
    );

    expect(buildIndex, `deploy-${app} has no build step`).not.toBe(-1);
    expect(guardIndex, `deploy-${app} has no verify-sentry-sourcemaps step`).not.toBe(-1);
    expect(deployIndex, `deploy-${app} has no deploy step`).not.toBe(-1);
    expect(guardIndex).toBeGreaterThan(buildIndex);
    expect(guardIndex).toBeLessThan(deployIndex);
    expect(
      codeLines(steps[guardIndex]).some(
        (l) => l.includes("set -o pipefail") || l.includes("set -euo pipefail")
      )
    ).toBe(true);
  });
});

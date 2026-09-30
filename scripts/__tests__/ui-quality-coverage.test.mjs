import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCoverage, main } from "../ui-quality/coverage.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY = 24 * 60 * 60 * 1000;
const FIRST_RUN = "2026-10-01T07:30:00Z";
const at = (days) => new Date(Date.parse(FIRST_RUN) + days * DAY).toISOString();

const row = (route, extra = {}) => ({
  route,
  app: "marketing",
  kind: "page",
  auth: "public",
  source_files: [],
  last_changed_at: FIRST_RUN,
  last_audited_at: null,
  rubric_version: null,
  reachability: null,
  ...extra,
});
const audited = (route, when) =>
  row(route, { last_audited_at: when, rubric_version: 1, reachability: "audited" });

let root;

function seed(rows, runs) {
  writeFileSync(
    join(root, "metrics", "ui-quality-ledger.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  writeFileSync(
    join(root, "metrics", "ui-quality-runs.jsonl"),
    runs.map((r) => JSON.stringify(r)).join("\n") + (runs.length ? "\n" : "")
  );
}

/** Capture both main's own writes and runCheck's console.log verdict, in order. */
function run(argv) {
  const out = [];
  const log = vi.spyOn(console, "log").mockImplementation((line) => out.push(`${line}\n`));
  try {
    const code = main([...argv, "--root", root], { stdout: (s) => out.push(s) });
    return { code, out: out.join("") };
  } finally {
    log.mockRestore();
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ui-quality-coverage-"));
  mkdirSync(join(root, "metrics"));
});

describe("computeCoverage", () => {
  it("is provisional and never 100 % with an empty runs file", () => {
    const rows = [audited("/", at(0)), audited("status", at(0))];
    const report = computeCoverage(rows, [], at(1));
    expect(report.provisional).toBe(true);
    expect(report.percent).toBeLessThan(100);
  });

  it("excludes redirect rows — they are never due, so never audited", () => {
    const report = computeCoverage(
      [audited("/", at(40)), row("rialto/*", { kind: "redirect" })],
      [{ ts: FIRST_RUN }],
      at(41)
    );
    expect(report.denominator).toBe(1);
    expect(report.percent).toBe(100);
  });
});

describe("coverage.mjs", () => {
  it("empty runs file: provisional, exit 0", () => {
    seed([row("/")], []);
    const { code, out } = run([]);
    expect(code).toBe(0);
    expect(out).toMatch(/provisional/i);
  });

  it("31 days after the first run with one stale audited row: exit 1", () => {
    seed([audited("/", at(30)), audited("status", at(-5))], [{ ts: FIRST_RUN }]);
    const { code, out } = run(["--now", at(31)]);
    expect(code).toBe(1);
    expect(out).toMatch(/50(\.0)? ?%/);
    expect(out).toMatch(/marketing status/);
  });

  it("all audited within 30 days after the mark: exit 0 at 100 %", () => {
    seed([audited("/", at(30)), audited("status", at(25))], [{ ts: FIRST_RUN }]);
    const { code, out } = run(["--now", at(31)]);
    expect(code).toBe(0);
    expect(out).toMatch(/100(\.0)? ?%/);
  });

  it("drops unreachable rows from the denominator and lists them by reason", () => {
    seed(
      [
        audited("/", at(30)),
        row("timeline", { app: "hospitality", auth: "auth0", reachability: "unreachable:auth" }),
        row("acmm", { reachability: "unreachable:build" }),
      ],
      [{ ts: FIRST_RUN }]
    );
    const { code, out } = run(["--now", at(31)]);
    expect(code).toBe(0);
    expect(out).toMatch(/100(\.0)? ?%/);
    expect(out).toMatch(/unreachable:auth.*\n.*hospitality timeline/);
    expect(out).toMatch(/unreachable:build.*\n.*marketing acmm/);
  });

  it("keeps unjudged rows in the denominator under their own heading: 9 audited + 1 malformed → 90 %, exit 1", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => audited(`p${i}`, at(30))),
      row("broken", { reachability: "unjudged:malformed" }),
    ];
    seed(rows, [{ ts: FIRST_RUN }]);
    const { code, out } = run(["--now", at(31)]);
    expect(code).toBe(1);
    expect(out).toMatch(/90(\.0)? ?%/);
    const unjudgedAt = out.indexOf("unjudged:malformed");
    expect(unjudgedAt).toBeGreaterThan(-1);
    expect(out.slice(unjudgedAt)).toMatch(/marketing broken/);
    expect(out).not.toMatch(/unreachable[^\n]*\n[^\n]*marketing broken/);
  });

  it("--json carries unjudged rows separately from unreachable ones", () => {
    seed(
      [
        audited("/", at(30)),
        row("broken", { reachability: "unjudged:malformed" }),
        row("acmm", { reachability: "unreachable:build" }),
      ],
      [{ ts: FIRST_RUN }]
    );
    const { code, out } = run(["--json", "--now", at(31)]);
    const report = JSON.parse(out);
    expect(code).toBe(1);
    expect(report.percent).toBe(50);
    expect(report.provisional).toBe(false);
    expect(report.unjudged).toEqual({ "unjudged:malformed": ["marketing broken"] });
    expect(report.unreachable).toEqual({ "unreachable:build": ["marketing acmm"] });
  });

  it("prints a provisional figure and exits 0 on the committed ledger", () => {
    const out = execFileSync(process.execPath, [join(REPO, "scripts/ui-quality/coverage.mjs")], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out).toMatch(/provisional/i);
  });
});

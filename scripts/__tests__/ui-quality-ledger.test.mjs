import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, parseLedger, renderLedger, LEDGER_COLUMNS } from "../ui-quality/ledger.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROUTES = [
  {
    route: "/",
    app: "marketing",
    kind: "page",
    auth: "public",
    source_files: ["apps/marketing/src/pages/HomePage.tsx", "apps/marketing/src/App.tsx"],
  },
  {
    route: "book/:venueSlug",
    app: "hospitality",
    kind: "page",
    auth: "public",
    source_files: [
      "apps/hospitality/src/pages/PublicBookingPage.tsx",
      "apps/hospitality/src/main.tsx",
    ],
  },
  {
    route: "timeline",
    app: "hospitality",
    kind: "page",
    auth: "auth0",
    source_files: ["apps/hospitality/src/pages/TimelinePage.tsx", "apps/hospitality/src/main.tsx"],
  },
];

let root;

function ledgerPath() {
  return join(root, "metrics", "ui-quality-ledger.jsonl");
}

/** Run the CLI body against the temp root with an injected inventory + git. */
function run(argv, overrides = {}) {
  const out = [];
  const err = [];
  const code = main(argv, {
    root,
    inventory: () => ROUTES,
    lastChangedAt: (files) => `2026-09-0${files.length}T00:00:00Z`,
    gitDepth: () => "full",
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    ...overrides,
  });
  return { code, out: out.join(""), err: err.join("") };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ui-quality-ledger-"));
  mkdirSync(join(root, "metrics"));
});

describe("ledger.mjs generate", () => {
  it("writes one sorted row per route template with identity + audit columns", () => {
    expect(run(["generate"]).code).toBe(0);
    const rows = parseLedger(readFileSync(ledgerPath(), "utf8"));
    expect(rows.map((r) => `${r.app}|${r.route}`)).toEqual([
      "hospitality|book/:venueSlug",
      "hospitality|timeline",
      "marketing|/",
    ]);
    expect(Object.keys(rows[0])).toEqual(LEDGER_COLUMNS);
    expect(rows[0]).toMatchObject({
      last_changed_at: "2026-09-02T00:00:00Z",
      last_audited_at: null,
      rubric_version: null,
      reachability: null,
    });
  });

  it("is byte-identical when run twice", () => {
    run(["generate"]);
    const first = readFileSync(ledgerPath(), "utf8");
    run(["generate"]);
    expect(readFileSync(ledgerPath(), "utf8")).toBe(first);
  });

  it("preserves audit columns and last_changed_at of existing rows across regeneration", () => {
    run(["generate"]);
    const rows = parseLedger(readFileSync(ledgerPath(), "utf8"));
    const audited = rows.map((r) =>
      r.route === "timeline"
        ? {
            ...r,
            last_changed_at: "2026-01-01T00:00:00Z",
            last_audited_at: "2026-09-20T07:30:00Z",
            rubric_version: 1,
            reachability: "audited",
          }
        : r
    );
    writeFileSync(ledgerPath(), renderLedger(audited));
    run(["generate"], { lastChangedAt: () => "2099-01-01T00:00:00Z" });
    const after = parseLedger(readFileSync(ledgerPath(), "utf8")).find(
      (r) => r.route === "timeline"
    );
    expect(after).toMatchObject({
      last_changed_at: "2026-01-01T00:00:00Z",
      last_audited_at: "2026-09-20T07:30:00Z",
      rubric_version: 1,
      reachability: "audited",
    });
  });

  it("drops rows whose route template no longer exists", () => {
    run(["generate"]);
    run(["generate"], { inventory: () => ROUTES.slice(0, 2) });
    const rows = parseLedger(readFileSync(ledgerPath(), "utf8"));
    expect(rows.map((r) => r.route)).not.toContain("timeline");
  });

  it("reports git_depth and degrades a new row to null when git is unavailable", () => {
    const result = run(["generate"], { lastChangedAt: () => null, gitDepth: () => "unknown" });
    expect(result.err).toMatch(/git_depth: unknown/);
    const rows = parseLedger(readFileSync(ledgerPath(), "utf8"));
    expect(rows.every((r) => r.last_changed_at === null)).toBe(true);
  });

  it("exits 2 and writes nothing when the inventory throws (zero routes)", () => {
    const result = run(["generate"], {
      inventory: () => {
        throw new Error("hospitality: the router yielded zero routes");
      },
    });
    expect(result.code).toBe(2);
    expect(() => readFileSync(ledgerPath(), "utf8")).toThrow();
  });
});

describe("ledger.mjs check", () => {
  beforeEach(() => {
    run(["generate"]);
  });

  it("exits 0 on a clean file", () => {
    const result = run(["check"]);
    expect(result.code).toBe(0);
  });

  it("exits 1 on a hand-edited route, naming it, and never rewrites", () => {
    const text = readFileSync(ledgerPath(), "utf8").replace('"timeline"', '"timeline-x"');
    writeFileSync(ledgerPath(), text);
    const result = run(["check"]);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/timeline-x/);
    expect(result.out).toMatch(/hospitality timeline/);
    expect(readFileSync(ledgerPath(), "utf8")).toBe(text);
  });

  it("exits 1 on a stale row (a route the inventory no longer has)", () => {
    const result = run(["check"], { inventory: () => ROUTES.slice(0, 2) });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/removed.*timeline/);
  });

  it("exits 1 on a changed identity column", () => {
    const result = run(["check"], {
      inventory: () => ROUTES.map((r) => (r.route === "/" ? { ...r, kind: "redirect" } : r)),
    });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/changed.*marketing \//);
  });

  it("exits 1 when the committed ledger is missing", () => {
    const result = run(["check"], { root: mkdtempSync(join(tmpdir(), "ui-quality-empty-")) });
    expect(result.code).toBe(1);
  });
});

describe("repo wiring", () => {
  it("marks the ledger -merge (rewritten in place, so union merge would duplicate rows)", () => {
    const out = execFileSync("git", ["check-attr", "merge", "metrics/ui-quality-ledger.jsonl"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("metrics/ui-quality-ledger.jsonl: merge: unset");
  });

  it("keeps union merge for the append-only ui-quality metrics", () => {
    const out = execFileSync("git", ["check-attr", "merge", "metrics/ui-quality-runs.jsonl"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("metrics/ui-quality-runs.jsonl: merge: union");
  });

  it("the committed ledger passes check against the real inventory", () => {
    const result = main(["check"], {
      root: REPO,
      stdout: () => {},
      stderr: () => {},
    });
    expect(result).toBe(0);
  });
});

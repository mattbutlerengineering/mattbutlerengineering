import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const REAL_RUBRIC = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));

/** A valid fixture rubric at `version` (the version is not part of tells_hash). */
function writeRubric(version) {
  mkdirSync(join(root, "docs", "ui-quality"), { recursive: true });
  writeFileSync(
    join(root, "docs", "ui-quality", "rubric.json"),
    JSON.stringify({ ...REAL_RUBRIC, rubric_version: version })
  );
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
  writeRubric(1);
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

// ---------------------------------------------------------------------------
// refresh / due / record — the routine's per-fire round trip.
// ---------------------------------------------------------------------------

const NOW = "2026-10-01T07:30:00Z";
const DAY = 24 * 60 * 60 * 1000;
const daysBefore = (n) => new Date(Date.parse(NOW) - n * DAY).toISOString().replace(".000Z", "Z");

const row = (app, route, extra = {}) => ({
  route,
  app,
  kind: "page",
  auth: "public",
  source_files: [`apps/${app}/src/${route}.tsx`],
  last_changed_at: daysBefore(100),
  last_audited_at: null,
  rubric_version: null,
  reachability: null,
  ...extra,
});

const FIXTURES = {
  hospitality: { "book/:venueSlug": "/book/e2e-test-bistro" },
  marketing: { "*": "/ui-quality-not-found" },
};

function seed(rows) {
  writeFileSync(ledgerPath(), renderLedger(rows));
}

function ledgerRows() {
  return parseLedger(readFileSync(ledgerPath(), "utf8"));
}

function find(app, route) {
  return ledgerRows().find((r) => r.app === app && r.route === route);
}

function runAudit(argv, overrides = {}) {
  return run(argv, {
    inventory: () => ledgerRows(),
    fixtures: FIXTURES,
    now: () => NOW,
    ...overrides,
  });
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function writeManifest(app, rows) {
  mkdirSync(join(root, ".ui-quality", "captures", app), { recursive: true });
  writeFileSync(
    join(root, ".ui-quality", "captures", app, "manifest.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
}

const shot = (viewport) => ({ viewport, file: `x@${viewport}.png`, sha256: "ab" });

describe("ledger.mjs refresh", () => {
  it("recomputes last_changed_at for every row, keeping it when git is unavailable", () => {
    seed([row("marketing", "/"), row("marketing", "status")]);
    runAudit(["refresh"], { lastChangedAt: () => "2026-09-30T00:00:00Z" });
    expect(ledgerRows().every((r) => r.last_changed_at === "2026-09-30T00:00:00Z")).toBe(true);
    runAudit(["refresh"], { lastChangedAt: () => null, gitDepth: () => "unknown" });
    expect(ledgerRows().every((r) => r.last_changed_at === "2026-09-30T00:00:00Z")).toBe(true);
  });
});

describe("ledger.mjs due", () => {
  const base = () => [
    row("marketing", "/", {
      last_audited_at: daysBefore(1),
      reachability: "audited",
      rubric_version: 1,
    }), // fresh
    row("marketing", "status", {
      last_audited_at: daysBefore(30),
      reachability: "audited",
      rubric_version: 1,
    }), // TTL
    row("marketing", "weekly", {
      last_changed_at: daysBefore(1),
      last_audited_at: daysBefore(5),
      reachability: "audited",
      rubric_version: 1,
    }), // changed since audit
    row("marketing", "acmm"), // never audited
    row("marketing", "*", { kind: "not-found" }), // never audited, fixture
    row("marketing", "rialto/*", { kind: "redirect" }), // never planned
    row("hospitality", "book/:venueSlug"), // fixture
    row("hospitality", "timeline", { auth: "auth0" }),
    row("rialto-web", "demos/drivers/:id"), // no fixture
  ];

  it("selects never-audited, changed-since-audit and TTL-expired rows, staleness-first", () => {
    seed(base());
    expect(runAudit(["due"]).code).toBe(0);
    const due = readJson(".ui-quality/due.json");
    expect(due.due.map((d) => `${d.app}|${d.route}`)).toEqual([
      "hospitality|book/:venueSlug",
      "marketing|*",
      "marketing|acmm",
      "rialto-web|demos/drivers/:id",
      "marketing|status",
      "marketing|weekly",
    ]);
  });

  it("writes plan.json as { app → [{ route, path, viewports }] } resolving fixtures", () => {
    seed(base());
    runAudit(["due"]);
    const plan = readJson(".ui-quality/plan.json");
    expect(Object.keys(plan)).toEqual(["hospitality", "marketing"]);
    expect(plan.hospitality).toEqual([
      {
        route: "book/:venueSlug",
        path: "/book/e2e-test-bistro",
        viewports: [
          { width: 1280, height: 720 },
          { width: 375, height: 812 },
        ],
      },
    ]);
    expect(plan.marketing.map((p) => [p.route, p.path])).toEqual([
      ["*", "/ui-quality-not-found"],
      ["acmm", "/acmm"],
      ["status", "/status"],
      ["weekly", "/weekly"],
    ]);
  });

  it("plans a parameterised route without a fixture as unreachable:build no-fixture, not for capture", () => {
    seed(base());
    const result = runAudit(["due"]);
    const entry = readJson(".ui-quality/due.json").due.find((d) => d.route === "demos/drivers/:id");
    expect(entry).toMatchObject({ path: null, detail: "no-fixture" });
    expect(readJson(".ui-quality/plan.json")["rialto-web"]).toBeUndefined();
    expect(result.err).toMatch(/no-fixture.*demos\/drivers\/:id/);
  });

  it("never plans auth0 rows and marks them unreachable:auth in the same write", () => {
    seed(base());
    runAudit(["due"]);
    expect(JSON.stringify(readJson(".ui-quality/plan.json"))).not.toMatch(/timeline/);
    expect(find("hospitality", "timeline").reachability).toBe("unreachable:auth");
    expect(readJson(".ui-quality/due.json").unreachable_auth).toEqual([
      { app: "hospitality", route: "timeline" },
    ]);
    expect(find("marketing", "rialto/*").reachability).toBeNull(); // redirects are never due
  });

  it("caps the plan at MAX_ROUTES_PER_FIRE, most stale first", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      row("marketing", `p${String(i).padStart(2, "0")}`, {
        last_audited_at: daysBefore(29 + i),
        reachability: "audited",
      })
    );
    seed(many);
    runAudit(["due"]);
    const due = readJson(".ui-quality/due.json").due;
    expect(due).toHaveLength(40);
    expect(due[0].route).toBe("p44");
    expect(due.map((d) => d.route)).not.toContain("p00");
  });
});

describe("ledger.mjs record", () => {
  const judged = (routes, dropped = []) => {
    mkdirSync(join(root, ".ui-quality"), { recursive: true });
    writeFileSync(
      join(root, ".ui-quality", "judge-status.json"),
      JSON.stringify({ routes, dropped })
    );
  };

  beforeEach(() => {
    seed([
      row("marketing", "/", {
        last_audited_at: daysBefore(40),
        reachability: "audited",
        rubric_version: 1,
      }),
      row("marketing", "status", {
        last_audited_at: daysBefore(40),
        reachability: "audited",
        rubric_version: 1,
      }),
      row("marketing", "weekly"),
      row("marketing", "acmm"),
      row("marketing", "metrics"),
      row("hospitality", "timeline", { auth: "auth0" }),
      row("rialto-web", "demos/drivers/:id"),
    ]);
    writeRubric(2);
    runAudit(["due"]);
    writeManifest("marketing", [
      { route: "/", path: "/", screenshots: [shot("1280x720"), shot("375x812")] },
      { route: "status", path: "/status", screenshots: [shot("1280x720")] },
      { route: "weekly", path: "/weekly", screenshots: [shot("1280x720")] },
      { route: "acmm", path: "/acmm", screenshots: [], error: "navigation timeout" },
      // metrics: absent from the manifest entirely
    ]);
  });

  it("marks a judged row audited, advancing all three audit columns", () => {
    judged({ marketing: { "/": "judged", status: "unjudged:tool-error" } });
    expect(runAudit(["record"]).code).toBe(0);
    expect(find("marketing", "/")).toMatchObject({
      reachability: "audited",
      last_audited_at: NOW,
      rubric_version: 2,
    });
  });

  it("marks an unjudged row with its reason, dates untouched, and due selects it again", () => {
    judged({ marketing: { "/": "judged", status: "unjudged:tool-error" } });
    runAudit(["record"]);
    expect(find("marketing", "status")).toMatchObject({
      reachability: "unjudged:tool-error",
      last_audited_at: daysBefore(40),
      rubric_version: 1,
    });
    runAudit(["due"], { now: () => new Date(Date.parse(NOW) + 60_000).toISOString() });
    const next = readJson(".ui-quality/due.json").due.map((d) => d.route);
    expect(next).toContain("status");
    expect(next).not.toContain("/");
  });

  it("marks a captured row absent from judge-status unjudged:missing", () => {
    judged({ marketing: { "/": "judged" } });
    runAudit(["record"]);
    expect(find("marketing", "weekly").reachability).toBe("unjudged:missing");
  });

  it("marks an errored no-screenshot row, and a row in no manifest, unreachable:build", () => {
    judged({ marketing: { "/": "judged" } });
    runAudit(["record"]);
    expect(find("marketing", "acmm").reachability).toBe("unreachable:build");
    expect(find("marketing", "metrics").reachability).toBe("unreachable:build");
    expect(find("rialto-web", "demos/drivers/:id").reachability).toBe("unreachable:build");
  });

  it("with no judge-status file marks every captured row unjudged:missing and none audited", () => {
    const result = runAudit(["record"]);
    expect(result.code).toBe(0);
    expect(result.err).toMatch(/judge-status\.json.*missing/);
    for (const route of ["/", "status", "weekly"]) {
      expect(find("marketing", route).reachability).toBe("unjudged:missing");
    }
    expect(ledgerRows().some((r) => r.reachability === "audited")).toBe(false);
  });

  it("leaves no due row with reachability null", () => {
    judged({ marketing: { "/": "judged" } });
    runAudit(["record"]);
    const due = readJson(".ui-quality/due.json");
    for (const d of [...due.due, ...due.unreachable_auth]) {
      expect(find(d.app, d.route).reachability, `${d.app} ${d.route}`).not.toBeNull();
    }
  });

  it("appends one runs row with the fire's counts", () => {
    judged({ marketing: { "/": "judged", status: "unjudged:malformed" } }, [
      { app: "marketing", route: "/", tell: "agent-built/made-up", reason: "unknown-tell" },
    ]);
    runAudit(["record"]);
    const runs = parseLedger(readFileSync(join(root, "metrics", "ui-quality-runs.jsonl"), "utf8"));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({
      ts: NOW,
      due: 6,
      audited: 1,
      unreachable: { auth: 1, build: 3 },
      unjudged: 2,
      dropped_tells: 1,
      git_depth: "full",
      rubric_version: 2,
    });
  });

  it("exits 2 without a due.json to record against", () => {
    const fresh = mkdtempSync(join(tmpdir(), "ui-quality-nodue-"));
    mkdirSync(join(fresh, "metrics"));
    root = fresh;
    writeRubric(1);
    seed([row("marketing", "/")]);
    expect(runAudit(["record"]).code).toBe(2);
  });
});

describe("ledger.mjs rubric_version — a bump re-queues audited rows, last", () => {
  const versionOnly = (i) =>
    row("marketing", `v${String(i).padStart(2, "0")}`, {
      last_changed_at: daysBefore(200),
      last_audited_at: daysBefore(1 + i / 10),
      reachability: "audited",
      rubric_version: 1,
    });
  const changed = (i) =>
    row("marketing", `c${String(i).padStart(2, "0")}`, {
      last_changed_at: daysBefore(1),
      last_audited_at: daysBefore(2 + i / 10),
      reachability: "audited",
      rubric_version: 2,
    });
  const neverAudited = (i) => row("marketing", `n${String(i).padStart(2, "0")}`);
  const dueRoutes = () => readJson(".ui-quality/due.json").due.map((d) => d.route);
  const judgeAll = (routes) => {
    mkdirSync(join(root, ".ui-quality"), { recursive: true });
    writeFileSync(
      join(root, ".ui-quality", "judge-status.json"),
      JSON.stringify({
        routes: { marketing: Object.fromEntries(routes.map((r) => [r, "judged"])) },
        dropped: [],
      })
    );
    writeManifest(
      "marketing",
      routes.map((route) => ({ route, path: `/${route}`, screenshots: [shot("1280x720")] }))
    );
  };

  it("makes an audited-in-window row at v1 due under a v2 rubric", () => {
    writeRubric(2);
    seed([versionOnly(0)]);
    runAudit(["due"]);
    expect(dueRoutes()).toEqual(["v00"]);
  });

  it("keeps an audited-in-window row at v1 NOT due under a v1 rubric", () => {
    seed([versionOnly(0)]);
    runAudit(["due"]);
    expect(dueRoutes()).toEqual([]);
  });

  it("45 changed/never-audited + 10 version-only: the plan holds 40 non-version rows and no version-only row", () => {
    writeRubric(2);
    seed([
      ...Array.from({ length: 30 }, (_, i) => changed(i)),
      ...Array.from({ length: 15 }, (_, i) => neverAudited(i)),
      ...Array.from({ length: 10 }, (_, i) => versionOnly(i)),
    ]);
    runAudit(["due"]);
    const due = dueRoutes();
    expect(due).toHaveLength(40);
    expect(due.some((r) => r.startsWith("v"))).toBe(false);
  });

  it("30 changed + 20 version-only: 30 changed, then the 10 stalest version-only rows", () => {
    writeRubric(2);
    seed([
      ...Array.from({ length: 30 }, (_, i) => changed(i)),
      ...Array.from({ length: 20 }, (_, i) => versionOnly(i)),
    ]);
    runAudit(["due"]);
    const due = dueRoutes();
    expect(due).toHaveLength(40);
    expect(due.slice(0, 30).every((r) => r.startsWith("c"))).toBe(true);
    expect(due.slice(30)).toEqual(
      Array.from({ length: 10 }, (_, i) => `v${String(19 - i).padStart(2, "0")}`)
    );
  });

  it("drains across fires: each fire takes the stalest version-only rows the changed rows leave room for", () => {
    writeRubric(2);
    seed([
      ...Array.from({ length: 30 }, (_, i) => changed(i)),
      ...Array.from({ length: 25 }, (_, i) => versionOnly(i)),
    ]);
    const fires = [];
    for (let fire = 0; fire < 3; fire += 1) {
      const now = new Date(Date.parse(NOW) + fire * 60_000).toISOString();
      runAudit(["due"], { now: () => now });
      const versionRows = dueRoutes().filter((r) => r.startsWith("v"));
      fires.push(versionRows);
      judgeAll(versionRows); // the changed rows stay due (captured by nobody)
      expect(runAudit(["record"], { now: () => now }).code).toBe(0);
    }
    expect(fires.map((f) => f.length)).toEqual([10, 10, 5]);
    expect(new Set(fires.flat()).size).toBe(25);
    expect(
      ledgerRows()
        .filter((r) => r.route.startsWith("v"))
        .map((r) => r.rubric_version)
    ).toEqual(Array(25).fill(2));
  });

  it("a version-stale row older than AUDIT_TTL_DAYS is TTL-due, ahead of every version-only row", () => {
    writeRubric(2);
    const ttl = row("marketing", "ttl", {
      last_audited_at: daysBefore(29),
      reachability: "audited",
      rubric_version: 1,
    });
    seed([
      ...Array.from({ length: 40 }, (_, i) => changed(i)),
      ...Array.from({ length: 5 }, (_, i) => versionOnly(i)),
      ttl,
    ]);
    runAudit(["due"]);
    const due = dueRoutes();
    expect(due).toContain("ttl");
    expect(due.some((r) => r.startsWith("v"))).toBe(false);
  });

  it("due.json carries the rubric_version it planned under", () => {
    writeRubric(2);
    seed([versionOnly(0)]);
    runAudit(["due"]);
    expect(readJson(".ui-quality/due.json").rubric_version).toBe(2);
  });

  it("record with no flag reads the version from the rubric and stamps audited rows with it", () => {
    writeRubric(2);
    seed([versionOnly(0)]);
    runAudit(["due"]);
    judgeAll(["v00"]);
    expect(runAudit(["record"]).code).toBe(0);
    expect(find("marketing", "v00")).toMatchObject({ reachability: "audited", rubric_version: 2 });
    const runs = parseLedger(readFileSync(join(root, "metrics", "ui-quality-runs.jsonl"), "utf8"));
    expect(runs[0].rubric_version).toBe(2);
  });

  it("a leftover --rubric-version flag exits 2 and writes nothing — the retired flag is never honoured or ignored", () => {
    writeRubric(2);
    seed([versionOnly(0)]);
    runAudit(["due"]);
    judgeAll(["v00"]);
    const before = readFileSync(ledgerPath(), "utf8");
    const result = runAudit(["record", "--rubric-version", "1"]);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(/--rubric-version/);
    expect(readFileSync(ledgerPath(), "utf8")).toBe(before);
    expect(existsSync(join(root, "metrics", "ui-quality-runs.jsonl"))).toBe(false);
  });

  it("due.json at v1 with rubric.json at v2 (rubric changed mid-fire): exit 2, ledger + runs byte-identical", () => {
    seed([versionOnly(0), neverAudited(0)]);
    runAudit(["due"]);
    judgeAll(["n00"]);
    writeFileSync(join(root, "metrics", "ui-quality-runs.jsonl"), '{"ts":"earlier"}\n');
    writeRubric(2);
    const ledgerBefore = readFileSync(ledgerPath(), "utf8");
    const result = runAudit(["record"]);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(/planned under rubric_version 1.*now 2/);
    expect(readFileSync(ledgerPath(), "utf8")).toBe(ledgerBefore);
    expect(readFileSync(join(root, "metrics", "ui-quality-runs.jsonl"), "utf8")).toBe(
      '{"ts":"earlier"}\n'
    );
  });

  it("an unreadable or invalid rubric exits 2 from both due and record", () => {
    seed([neverAudited(0)]);
    runAudit(["due"]);
    writeFileSync(join(root, "docs", "ui-quality", "rubric.json"), "{nope");
    expect(runAudit(["due"]).code).toBe(2);
    expect(runAudit(["record"]).code).toBe(2);
    writeFileSync(
      join(root, "docs", "ui-quality", "rubric.json"),
      JSON.stringify({ ...REAL_RUBRIC, tells_hash: "0" })
    );
    expect(runAudit(["due"]).code).toBe(2);
    expect(runAudit(["record"]).code).toBe(2);
  });
});

describe("work dir", () => {
  it("gitignores .ui-quality/", () => {
    const out = execFileSync("git", ["check-ignore", ".ui-quality/plan.json"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(out.trim()).toBe(".ui-quality/plan.json");
  });

  it("seeds route fixtures for every parameterised public route the plan needs", () => {
    const fixtures = JSON.parse(
      readFileSync(join(REPO, "scripts/ui-quality/route-fixtures.json"), "utf8")
    );
    expect(fixtures.hospitality["book/:venueSlug"]).toBe("/book/e2e-test-bistro");
    expect(fixtures.hospitality["floor-plans/:id"]).toBe("/floor-plans/fp_e2e_001");
    expect(fixtures["rialto-web"]["demos/drivers/:id"]).toBe("/demos/drivers/1");
    expect(fixtures["rialto-web"]["demos/drivers/:id/edit"]).toBe("/demos/drivers/1/edit");
  });
});

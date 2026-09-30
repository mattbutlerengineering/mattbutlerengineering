import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findingKey, main } from "../ui-quality/findings.mjs";
import { hashTells } from "../ui-quality/rubric.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_RUBRIC = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));
const PLAN = ".ui-quality/findings.plan.json";
const LEDGER = "metrics/ui-quality-findings.json";

let root;

const finding = (app, route, tell, severity = "P2", extra = {}) => ({
  app,
  route,
  tell,
  severity,
  evidence: { message: `${tell} on ${route}`, screenshot_sha256: "a".repeat(64) },
  ...extra,
});

const DEAD = finding("marketing", "/", "bugs/dead-in-app-link", "P1");
const AXE = finding("hospitality", "book/:venueSlug", "accessibility/axe-moderate");
const ALT = finding("marketing", "acmm", "accessibility/non-descriptive-alt");

function writeRubric(rubric) {
  mkdirSync(join(root, "docs/ui-quality"), { recursive: true });
  writeFileSync(join(root, "docs/ui-quality/rubric.json"), JSON.stringify(rubric, null, 2));
}

/** A valid v2 rubric that retired `retire` and kept every other v1 tell. */
function rubricV2(retire) {
  const tells = REAL_RUBRIC.tells.filter((t) => t.id !== retire);
  return { ...REAL_RUBRIC, rubric_version: 2, tells, tells_hash: hashTells(tells) };
}

function writeJson(rel, value) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

const record = (issue, extra = {}) => ({
  issue,
  carrier: "issue",
  state: "open",
  severity: "P2",
  first_seen: "2026-10-01",
  last_seen: "2026-10-01",
  escalated_at: null,
  ...extra,
});

function plan(files, states = {}, extra = []) {
  const out = [];
  const err = [];
  const args = ["plan"];
  files.forEach((f, i) => args.push("--findings", writeJson(`in/findings-${i}.json`, f)));
  args.push("--issue-states", writeJson("in/states.json", states), ...extra, "--root", root);
  const code = main(args, { stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  const planPath = join(root, PLAN);
  const result = existsSync(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : null;
  return { code, plan: result, out: out.join(""), err: err.join("") };
}

const byAction = (p, action) => p.actions.filter((a) => a.action === action);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ui-quality-findings-"));
  mkdirSync(join(root, "metrics"));
  writeRubric(REAL_RUBRIC);
});

describe("findingKey", () => {
  it("is <app>|<route>|r<rubric_version>|<tell-id>", () => {
    expect(findingKey(AXE, 1)).toBe("hospitality|book/:venueSlug|r1|accessibility/axe-moderate");
  });
});

describe("findings.mjs plan — dedupe through fileIssue()", () => {
  it("creates one issue per new finding with a deterministic title and the three labels", () => {
    const { code, plan: p } = plan([[DEAD, AXE]]);
    expect(code).toBe(0);
    expect(byAction(p, "create")).toHaveLength(2);
    const dead = p.actions.find((a) => a.key === "marketing|/|r1|bugs/dead-in-app-link");
    expect(dead.title).toBe("ui-quality: marketing / — bugs/dead-in-app-link (rubric v1)");
    expect(dead.labels).toEqual(["ui-quality", "ui-quality:p1", "ready"]);
    const axe = p.actions.find((a) => a.key === findingKey(AXE, 1));
    expect(axe.labels).toEqual(["ui-quality", "ui-quality:p2", "ready"]);
    expect(axe.body).toContain("accessibility/axe-moderate on book/:venueSlug");
    expect(axe.body).toContain("docs/ui-quality/rubric.md");
  });

  it("titles carry no timestamp or counter — a re-plan renders them byte-identically", () => {
    const first = plan([[DEAD, AXE]]).plan;
    const second = plan([[DEAD, AXE]]).plan;
    expect(second).toEqual(first);
    for (const a of first.actions) expect(a.title).not.toMatch(/\d{4}-\d{2}-\d{2}|#\d+|\(\d+\)/);
  });

  it("a second plan with the first plan's issues open yields zero create", () => {
    writeJson(LEDGER, {
      [findingKey(DEAD, 1)]: record(101, { severity: "P1" }),
      [findingKey(AXE, 1)]: record(102),
    });
    const { code, plan: p } = plan([[DEAD, AXE]], { 101: "open", 102: "open" });
    expect(code).toBe(0);
    expect(byAction(p, "create")).toHaveLength(0);
    expect(
      byAction(p, "skip")
        .map((a) => a.issue)
        .sort()
    ).toEqual([101, 102]);
  });

  it("a closed issue is reopened under the same number; a missing one is created fresh", () => {
    writeJson(LEDGER, {
      [findingKey(DEAD, 1)]: record(101, { severity: "P1" }),
      [findingKey(AXE, 1)]: record(102),
    });
    const { plan: p } = plan([[DEAD, AXE]], { 101: "closed", 102: "missing" });
    expect(byAction(p, "reopen")).toEqual([
      expect.objectContaining({ key: findingKey(DEAD, 1), issue: 101 }),
    ]);
    expect(byAction(p, "create").map((a) => a.key)).toEqual([findingKey(AXE, 1)]);
  });

  it("a ledgered key absent from a partial state map is skipped and reported, never re-created", () => {
    writeJson(LEDGER, {
      [findingKey(DEAD, 1)]: record(101, { severity: "P1" }),
      [findingKey(AXE, 1)]: record(102),
    });
    const { code, plan: p, err } = plan([[DEAD, AXE]], { 101: "open" });
    expect(code).toBe(0);
    expect(byAction(p, "create")).toHaveLength(0);
    expect(p.actions.find((a) => a.key === findingKey(AXE, 1))).toMatchObject({
      action: "skip",
      issue: 102,
    });
    expect(p.reports).toEqual([`${findingKey(AXE, 1)}: issue #102 has no state — skipped`]);
    expect(err).toContain("issue #102 has no state");
  });

  it("two --findings files plan the union, identically to the same set in one file", () => {
    const two = plan([[DEAD], [AXE, ALT]]).plan;
    const one = plan([[AXE, ALT, DEAD]]).plan;
    expect(two).toEqual(one);
    expect(two.actions).toHaveLength(3);
  });

  it.each([0, 1])("an unknown tell in file %i exits 2 and writes no plan", (bad) => {
    const files = [[DEAD], [AXE]];
    files[bad] = [...files[bad], finding("marketing", "/", "agent-built/made-up")];
    const { code, plan: p, err } = plan(files);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("agent-built/made-up");
  });
});

describe("findings.mjs plan — unmigrated keys after a rubric bump", () => {
  const OLD = "hospitality|book/:venueSlug|r1|accessibility/axe-moderate";

  it("refuses while an open r1 key's tell survives in v2, naming migrate and the key", () => {
    writeRubric(rubricV2("agent-built/generic-hero-copy"));
    writeJson(LEDGER, { [OLD]: record(102) });
    const { code, plan: p, err } = plan([[DEAD]], { 102: "open" });
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("migrate");
    expect(err).toContain(OLD);
  });

  it("plans normally when that key is closed", () => {
    writeRubric(rubricV2("agent-built/generic-hero-copy"));
    writeJson(LEDGER, { [OLD]: record(102, { state: "closed" }) });
    const { code, plan: p } = plan([[DEAD]], { 102: "closed" });
    expect(code).toBe(0);
    expect(p.actions.map((a) => a.title)).toEqual([
      "ui-quality: marketing / — bugs/dead-in-app-link (rubric v2)",
    ]);
  });

  it("plans normally when the open r1 key's tell was retired by v2", () => {
    writeRubric(rubricV2("accessibility/axe-moderate"));
    writeJson(LEDGER, { [OLD]: record(102) });
    const { code } = plan([[DEAD]], { 102: "open" });
    expect(code).toBe(0);
  });
});

describe("findings.mjs plan — carrier rules", () => {
  const PASS = ["--calibration-status", "pass"];
  const routes = (n) => Array.from({ length: n }, (_, i) => `r${i}`);

  it("6 P1s on one tell in one app become exactly one aggregate action", () => {
    const dead = routes(6).map((r) => finding("marketing", r, "bugs/dead-in-app-link", "P1"));
    const { plan: p } = plan([dead], {}, PASS);
    expect(p.actions).toHaveLength(1);
    const agg = p.actions[0];
    expect(agg).toMatchObject({
      action: "create",
      carrier: "aggregate",
      title: "ui-quality: marketing — bugs/dead-in-app-link on multiple routes (rubric v1)",
      labels: ["ui-quality", "ui-quality:p1", "ready"],
    });
    expect(agg.members).toEqual(dead.map((f) => findingKey(f, 1)).sort());
    for (const r of routes(6)) expect(agg.body).toContain(`\`${r}\``);
  });

  it("5 P1s on one tell stay individual issues", () => {
    const dead = routes(5).map((r) => finding("marketing", r, "bugs/dead-in-app-link", "P1"));
    const { plan: p } = plan([dead], {}, PASS);
    expect(byAction(p, "create")).toHaveLength(5);
    expect(p.actions.every((a) => a.carrier === "issue")).toBe(true);
  });

  it("5 new P2s → 3 issues + 2 seeds, and the seeds stay seeds on the next fire", () => {
    const axe = routes(5).map((r) => finding("marketing", r, "accessibility/axe-moderate"));
    const { plan: p } = plan([axe], {}, PASS);
    expect(byAction(p, "create")).toHaveLength(3);
    expect(p.seeds.map((s) => s.key)).toEqual(axe.slice(3).map((f) => findingKey(f, 1)));
    expect(p.seeds[0].title).toBe(
      "ui-quality: marketing r3 — accessibility/axe-moderate (rubric v1)"
    );

    writeJson(LEDGER, {
      ...Object.fromEntries(axe.slice(0, 3).map((f, i) => [findingKey(f, 1), record(200 + i)])),
      ...Object.fromEntries(
        axe.slice(3).map((f) => [findingKey(f, 1), record(null, { carrier: "seed" })])
      ),
    });
    const next = plan([axe], { 200: "open", 201: "open", 202: "open" }, PASS).plan;
    expect(next.actions.filter((a) => a.action !== "skip")).toEqual([]);
    expect(next.seeds).toEqual([]);
  });

  it("marks one non-visual single-file finding as the fix-PR candidate, never a CSS tell", () => {
    const css = finding("marketing", "/", "agent-built/gray-card-border", "P2", {
      evidence: { message: "grey border", file: "apps/marketing/src/pages/Home.module.css" },
    });
    const alt = finding("marketing", "acmm", "accessibility/non-descriptive-alt", "P2", {
      evidence: { message: 'alt="image"', file: "apps/marketing/src/pages/AcmmPage.tsx" },
    });
    const { plan: p } = plan([[css, alt]], {}, PASS);
    expect(p.fix_pr_candidate).toBe(findingKey(alt, 1));
    expect(p.actions.filter((a) => a.fix_pr_candidate).map((a) => a.key)).toEqual([
      findingKey(alt, 1),
    ]);
  });

  it("never marks a finding with no file or a rialto/.github file", () => {
    const alt = (route, file) =>
      finding("marketing", route, "accessibility/non-descriptive-alt", "P2", {
        evidence: { message: "x", ...(file === undefined ? {} : { file }) },
      });
    const { plan: p } = plan(
      [
        [
          alt("a"),
          alt("b", "packages/rialto/src/components/Card/Card.tsx"),
          alt("c", ".github/workflows/ci.yml"),
        ],
      ],
      {},
      PASS
    );
    expect(p.fix_pr_candidate).toBeNull();
  });

  it("calibration failed removes agent-built findings only; pass keeps them", () => {
    const grad = finding("marketing", "/", "agent-built/gradient-background");
    const all = [grad, ALT, DEAD];
    const failed = plan([all], {}, ["--calibration-status", "failed"]).plan;
    expect(failed.actions.map((a) => a.key).sort()).toEqual(
      [findingKey(ALT, 1), findingKey(DEAD, 1)].sort()
    );
    expect(failed.dropped).toEqual([findingKey(grad, 1)]);
    const passed = plan([all], {}, PASS).plan;
    expect(passed.actions).toHaveLength(3);
  });

  it("no --calibration-status is treated as stale — agent-built findings drop", () => {
    const grad = finding("marketing", "/", "agent-built/gradient-background");
    const { plan: p, err } = plan([[grad, DEAD]]);
    expect(p.actions.map((a) => a.key)).toEqual([findingKey(DEAD, 1)]);
    expect(err).toContain("stale");
  });

  it("rejects an unknown --calibration-status", () => {
    expect(plan([[DEAD]], {}, ["--calibration-status", "maybe"]).code).toBe(2);
  });

  it("a finding carrying legacy: 5271 links the legacy issue instead of creating", () => {
    const legacy = { ...AXE, legacy: 5271 };
    const { plan: p } = plan([[legacy]], { 5271: "open" }, PASS);
    expect(byAction(p, "create")).toHaveLength(0);
    expect(p.actions).toEqual([
      expect.objectContaining({ key: findingKey(AXE, 1), action: "comment", issue: 5271 }),
    ]);
    expect(p.actions[0].body).toContain("#5271");
    expect(p.actions[0].legacy).toBe(5271);
  });

  it("a closed legacy issue is reopened, and a legacy issue with no state is skipped", () => {
    const legacy = { ...AXE, legacy: 5271 };
    expect(plan([[legacy]], { 5271: "closed" }, PASS).plan.actions[0]).toMatchObject({
      action: "reopen",
      issue: 5271,
    });
    const partial = plan([[legacy]], {}, PASS).plan;
    expect(partial.actions[0]).toMatchObject({ action: "skip", issue: 5271 });
    expect(partial.reports).toHaveLength(1);
  });

  it("cites a backlog seed whose text names the finding", () => {
    mkdirSync(join(root, "docs"), { recursive: true });
    const seedLine =
      "- ui-quality: hospitality book/:venueSlug — accessibility/axe-moderate (rubric v1) (from: session:2026-10-01)";
    writeFileSync(join(root, "docs/backlog.md"), `# Seed backlog\n\n- unrelated\n${seedLine}\n`);
    const { plan: p } = plan([[AXE]], {}, PASS);
    expect(p.actions[0].body).toContain(seedLine.slice(2));
    expect(p.actions[0].body).not.toContain("unrelated");
  });
});

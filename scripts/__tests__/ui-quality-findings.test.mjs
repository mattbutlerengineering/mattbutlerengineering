import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESCALATION_FILE, findingKey, main } from "../ui-quality/findings.mjs";
import { ESCALATION_TITLE, titleFor } from "../ui-quality/findings-plan.mjs";
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

/**
 * One `--labelled-issues` entry, as routine step 6b writes it from
 * `search_issues`. A bare number in a test's list means an issue whose title
 * is no finding title — the plan can never adopt it.
 */
const labelledIssue = (number, title = "an unrelated ui-quality issue", state = "open") => ({
  number,
  title,
  state,
});
const toLabelled = (list) => list.map((i) => (typeof i === "number" ? labelledIssue(i) : i));

/** `labelled`: the `--labelled-issues` value — `null` omits the flag, a string is a raw path. */
function plan(files, states = {}, extra = [], labelled = []) {
  const out = [];
  const err = [];
  const args = ["plan"];
  files.forEach((f, i) => args.push("--findings", writeJson(`in/findings-${i}.json`, f)));
  args.push("--issue-states", writeJson("in/states.json", states), ...extra, "--root", root);
  if (typeof labelled === "string") args.push("--labelled-issues", labelled);
  else if (labelled !== null)
    args.push("--labelled-issues", writeJson("in/labelled.json", toLabelled(labelled)));
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

describe("findings.mjs plan — --labelled-issues completeness check", () => {
  const ledgered = () =>
    writeJson(LEDGER, {
      [findingKey(DEAD, 1)]: record(101, { severity: "P1" }),
      [findingKey({ ...DEAD, route: "(multiple)" }, 1)]: record(300, { severity: "P1" }),
      [findingKey({ ...DEAD, route: "acmm" }, 1)]: record(300, {
        severity: "P1",
        carrier: "aggregate:300",
      }),
      [findingKey(ALT, 1)]: record(null, { carrier: "seed" }),
    });

  it("without --labelled-issues it exits 2 and plans nothing", () => {
    const { code, plan: p, err } = plan([[DEAD]], {}, [], null);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("--labelled-issues");
  });

  it("an unreadable or non-array --labelled-issues file exits 2 and plans nothing", () => {
    expect(plan([[DEAD]], {}, [], join(root, "in/nope.json")).code).toBe(2);
    const bad = writeJson("in/bad.json", { 101: "open" });
    const { code, plan: p } = plan([[DEAD]], {}, [], bad);
    expect(code).toBe(2);
    expect(p).toBeNull();
  });

  it("a labelled number the findings ledger does not reference exits 2, names it, plans nothing", () => {
    ledgered();
    const { code, plan: p, err } = plan([[DEAD]], { 101: "open" }, [], [101, 300, 777, 778]);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("#777");
    expect(err).toContain("#778");
    expect(err).not.toContain("#101");
    expect(err).not.toContain("#300");
  });

  it("an empty ledger refuses any labelled issue — fire 2 on lost state never refiles", () => {
    const { code, plan: p, err } = plan([[DEAD]], {}, [], [101]);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("#101");
  });

  it("numbers referenced as `issue` or `aggregate:<n>` pass, and the plan is unchanged", () => {
    ledgered();
    const withFlag = plan([[DEAD]], { 101: "open", 300: "open" }, [], [101, 300]);
    expect(withFlag.code).toBe(0);
    expect(withFlag.plan.actions).toEqual([
      expect.objectContaining({ key: findingKey(DEAD, 1), action: "skip", issue: 101 }),
    ]);
    const empty = plan([[DEAD]], { 101: "open", 300: "open" }, [], []);
    expect(empty.plan).toEqual(withFlag.plan);
  });
});

// Re-review N3: an unknown `ui-quality` issue used to refuse filing on every
// fire forever, with the only signal in an unmerged log. It is now adopted
// when its title is a finding title, and otherwise escalated once.
describe("findings.mjs plan — unknown labelled issues: adopt or escalate once", () => {
  const ESCALATION = join(".ui-quality", "findings.escalation.json");
  const escalationOf = () =>
    existsSync(join(root, ESCALATION))
      ? JSON.parse(readFileSync(join(root, ESCALATION), "utf8"))
      : null;
  const DEAD_KEY = findingKey(DEAD, 1);

  it("the escalation file path is the one exported for the routine", () => {
    expect(ESCALATION_FILE).toBe("findings.escalation.json");
  });

  it("a bare-number list is refused as bad input — the plan needs titles and states", () => {
    const raw = writeJson("in/raw.json", [101]);
    const { code, plan: p, err } = plan([[DEAD]], {}, [], raw);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("--labelled-issues");
  });

  it("adopts an unknown issue titled as this fire's finding: skip under its key, no refile", () => {
    const { code, plan: p } = plan([[DEAD]], {}, [], [labelledIssue(101, titleFor(DEAD, 1))]);
    expect(code).toBe(0);
    expect(p.actions).toEqual([
      expect.objectContaining({ key: DEAD_KEY, action: "skip", issue: 101 }),
    ]);
    expect(byAction(p, "create")).toEqual([]);
  });

  it("a closed adopted issue whose finding recurs is reopened, like any ledgered one", () => {
    const { code, plan: p } = plan(
      [[DEAD]],
      {},
      [],
      [labelledIssue(101, titleFor(DEAD, 1), "closed")]
    );
    expect(code).toBe(0);
    expect(p.actions).toEqual([
      expect.objectContaining({ key: DEAD_KEY, action: "reopen", issue: 101 }),
    ]);
  });

  it("adopts an issue whose finding is absent this fire as an `adopt` action that record writes", () => {
    const aggregateTitle = `ui-quality: marketing — bugs/dead-in-app-link on multiple routes (rubric v1)`;
    const { code, plan: p } = plan(
      [[AXE]],
      {},
      [],
      [labelledIssue(101, titleFor(DEAD, 1)), labelledIssue(300, aggregateTitle)]
    );
    expect(code).toBe(0);
    const adopted = byAction(p, "adopt");
    expect(adopted).toEqual([
      expect.objectContaining({ key: DEAD_KEY, issue: 101, carrier: "issue", severity: "P1" }),
      expect.objectContaining({
        key: findingKey({ ...DEAD, route: "(multiple)" }, 1),
        issue: 300,
        carrier: "issue",
        severity: "P1",
      }),
    ]);
    expect(byAction(p, "create")).toEqual([expect.objectContaining({ key: findingKey(AXE, 1) })]);

    const executed = writeJson("in/executed.json", {
      ...p,
      actions: p.actions.map((a) => (a.action === "create" ? { ...a, issue: 555 } : a)),
    });
    expect(main(["record", "--executed", executed, "--root", root], { stderr: () => {} })).toBe(0);
    const ledger = JSON.parse(readFileSync(join(root, LEDGER), "utf8"));
    expect(ledger[DEAD_KEY]).toMatchObject({ issue: 101, carrier: "issue" });
    // Next fire, the adopted issues are known: nothing unknown, nothing escalated.
    const next = plan([[AXE]], { 101: "open", 300: "open", 555: "open" }, [], [101, 300, 555]);
    expect(next.code).toBe(0);
    expect(byAction(next.plan, "adopt")).toEqual([]);
  });

  it("escalates an unadoptable issue once: exit 2, no plan, one needs-review escalation naming it", () => {
    const { code, plan: p, err } = plan([[DEAD]], {}, [], [777]);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(err).toContain("#777");
    const escalation = escalationOf();
    expect(escalation).toMatchObject({
      action: "escalate",
      title: ESCALATION_TITLE,
      labels: ["ui-quality", "needs-review"],
      unknown: [777],
    });
    expect(escalation.body).toContain("#777");
    expect(escalation.body).toMatch(/remove the `ui-quality` label/);
  });

  it("while an escalation issue is open it is not re-created, and filing still refuses", () => {
    plan([[DEAD]], {}, [], [777]);
    const {
      code,
      plan: p,
      err,
    } = plan([[DEAD]], {}, [], [777, labelledIssue(900, ESCALATION_TITLE, "open")]);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(escalationOf()).toBeNull();
    expect(err).toContain("#900");
    expect(err).not.toMatch(/#900 .*does not reference|, #900/);
  });

  it("a closed escalation issue does not suppress a new one", () => {
    const { code } = plan([[DEAD]], {}, [], [777, labelledIssue(900, ESCALATION_TITLE, "closed")]);
    expect(code).toBe(2);
    expect(escalationOf()).toMatchObject({ unknown: [777] });
  });

  it("with one adoptable and one unadoptable issue it still refuses, escalating only the second", () => {
    const { code, plan: p } = plan([[DEAD]], {}, [], [labelledIssue(101, titleFor(DEAD, 1)), 777]);
    expect(code).toBe(2);
    expect(p).toBeNull();
    expect(escalationOf().unknown).toEqual([777]);
  });

  it("never adopts a stale-version title, an unknown tell, or a key already carried by another issue", () => {
    writeJson(LEDGER, { [DEAD_KEY]: record(101, { severity: "P1" }) });
    const stale = labelledIssue(701, titleFor(AXE, 0));
    const unknownTell = labelledIssue(702, "ui-quality: marketing / — made/up (rubric v1)");
    const duplicate = labelledIssue(703, titleFor(DEAD, 1));
    const { code } = plan([[DEAD]], { 101: "open" }, [], [101, stale, unknownTell, duplicate]);
    expect(code).toBe(2);
    expect(escalationOf().unknown).toEqual([701, 702, 703]);
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

function run(argv) {
  const out = [];
  const err = [];
  const code = main([...argv, "--root", root], {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  return { code, out: out.join(""), err: err.join("") };
}

const readLedger = () => JSON.parse(readFileSync(join(root, LEDGER), "utf8"));

/** The routine's executed plan: every create given the number GitHub returned. */
function execute(p, first = 500) {
  let next = first;
  return {
    ...p,
    actions: p.actions.map((a) => (a.action === "create" ? { ...a, issue: next++ } : a)),
  };
}

describe("findings.mjs record", () => {
  const NOW = ["--now", "2026-10-02T07:40:00Z"];

  it("round-trips issue numbers, carriers and last_seen, so the next plan creates nothing", () => {
    const first = plan([[DEAD, AXE]], {}, ["--calibration-status", "pass"]).plan;
    const executed = writeJson("in/executed.json", execute(first));
    expect(run(["record", "--executed", executed, ...NOW]).code).toBe(0);
    const ledger = readLedger();
    expect(ledger[findingKey(DEAD, 1)]).toEqual({
      issue: 501,
      carrier: "issue",
      state: "open",
      severity: "P1",
      first_seen: "2026-10-02",
      last_seen: "2026-10-02",
      escalated_at: null,
    });
    expect(ledger[findingKey(AXE, 1)].issue).toBe(500);
    const again = plan([[DEAD, AXE]], { 500: "open", 501: "open" }, [
      "--calibration-status",
      "pass",
    ]).plan;
    expect(again.actions.map((a) => a.action)).toEqual(["skip", "skip"]);
  });

  it("keeps first_seen and escalated_at on a later fire and advances last_seen", () => {
    writeJson(LEDGER, {
      [findingKey(AXE, 1)]: record(102, { escalated_at: "2026-10-01T08:00:00Z" }),
    });
    const p = plan([[AXE]], { 102: "open" }, ["--calibration-status", "pass"]).plan;
    run(["record", "--executed", writeJson("in/executed.json", p), ...NOW]);
    expect(readLedger()[findingKey(AXE, 1)]).toMatchObject({
      issue: 102,
      first_seen: "2026-10-01",
      last_seen: "2026-10-02",
      escalated_at: "2026-10-01T08:00:00Z",
    });
  });

  it("records seeds, aggregate members, a legacy link and the fix PR", () => {
    const axe = ["a", "b", "c", "d"].map((r) =>
      finding("marketing", r, "accessibility/axe-moderate")
    );
    const dead = ["p", "q", "r", "s", "t", "u"].map((r) =>
      finding("marketing", r, "bugs/dead-in-app-link", "P1")
    );
    const alt = finding("marketing", "acmm", "accessibility/non-descriptive-alt", "P2", {
      evidence: { message: "x", file: "apps/marketing/src/pages/AcmmPage.tsx" },
      legacy: 5271,
    });
    const p = plan([[...axe, ...dead, alt]], { 5271: "open" }, [
      "--calibration-status",
      "pass",
    ]).plan;
    const executed = { ...execute(p), fix_pr: { key: findingKey(alt, 1), pr: 5903 } };
    expect(run(["record", "--executed", writeJson("in/x.json", executed), ...NOW]).code).toBe(0);
    const ledger = readLedger();
    const agg = p.actions.find((a) => a.carrier === "aggregate");
    const aggIssue = ledger[agg.key].issue;
    expect(Number.isInteger(aggIssue)).toBe(true);
    for (const f of dead) {
      expect(ledger[findingKey(f, 1)]).toMatchObject({
        issue: aggIssue,
        carrier: `aggregate:${aggIssue}`,
      });
    }
    expect(ledger[findingKey(axe[3], 1)]).toMatchObject({ issue: null, carrier: "seed" });
    expect(ledger[findingKey(alt, 1)]).toMatchObject({
      issue: 5271,
      legacy: 5271,
      carrier: "fix-pr:5903",
    });
  });

  it("refuses a create that came back without an issue number and writes nothing", () => {
    const p = plan([[DEAD]], {}, ["--calibration-status", "pass"]).plan;
    const { code, err } = run(["record", "--executed", writeJson("in/x.json", p), ...NOW]);
    expect(code).toBe(2);
    expect(err).toContain(findingKey(DEAD, 1));
    expect(existsSync(join(root, LEDGER))).toBe(false);
  });
});

describe("findings.mjs migrate", () => {
  const OLD = "hospitality|book/:venueSlug|r1|accessibility/axe-moderate";
  const RETIRED = "marketing|/|r1|agent-built/generic-hero-copy";

  it("re-keys a surviving open finding under the same issue and reports a retired one", () => {
    writeRubric(rubricV2("agent-built/generic-hero-copy"));
    writeJson(LEDGER, {
      [OLD]: record(102),
      [RETIRED]: record(103),
      "marketing|x|r1|bugs/blank-render": record(104, { state: "closed" }),
    });
    const { code, out } = run(["migrate", "--from", "1", "--to", "2"]);
    expect(code).toBe(0);
    const ledger = readLedger();
    expect(ledger[OLD]).toBeUndefined();
    expect(ledger["hospitality|book/:venueSlug|r2|accessibility/axe-moderate"]).toEqual(
      record(102)
    );
    expect(ledger[RETIRED]).toEqual(record(103));
    expect(ledger["marketing|x|r1|bugs/blank-render"]).toEqual(record(104, { state: "closed" }));
    expect(JSON.parse(out)).toEqual({
      rekeyed: [
        { from: OLD, to: "hospitality|book/:venueSlug|r2|accessibility/axe-moderate", issue: 102 },
      ],
      retired: [{ key: RETIRED, issue: 103 }],
    });
  });

  it("refuses a --to that is not the rubric's current version", () => {
    writeJson(LEDGER, { [OLD]: record(102) });
    const { code, err } = run(["migrate", "--from", "1", "--to", "2"]);
    expect(code).toBe(2);
    expect(err).toContain("rubric v1");
    expect(readLedger()[OLD]).toEqual(record(102));
  });

  it("round-trip: a ledger that makes plan exit 2 under v2 plans normally after migrate", () => {
    writeRubric(rubricV2("agent-built/generic-hero-copy"));
    writeJson(LEDGER, { [OLD]: record(102) });
    expect(plan([[AXE]], { 102: "open" }).code).toBe(2);
    expect(run(["migrate", "--from", "1", "--to", "2"]).code).toBe(0);
    const { code, plan: p } = plan([[AXE]], { 102: "open" });
    expect(code).toBe(0);
    expect(p.actions).toEqual([
      expect.objectContaining({
        key: "hospitality|book/:venueSlug|r2|accessibility/axe-moderate",
        action: "skip",
        issue: 102,
      }),
    ]);
  });
});

describe("findings.mjs seeds", () => {
  const PROTOCOL = /^- .+ \(from: session:\d{4}-\d{2}-\d{2}\)$/;

  it("appends protocol-form lines and never rewrites an existing backlog line", () => {
    mkdirSync(join(root, "docs"), { recursive: true });
    const existing =
      "# Seed backlog\n\n- keep me exactly (from: #1)\n- ui-quality: marketing r3 — accessibility/axe-moderate (rubric v1) (from: session:2026-10-01)\n";
    writeFileSync(join(root, "docs/backlog.md"), existing);
    const axe = ["r0", "r1", "r2", "r3", "r4"].map((r) =>
      finding("marketing", r, "accessibility/axe-moderate")
    );
    const p = plan([axe], {}, ["--calibration-status", "pass"]).plan;
    const { code, out } = run([
      "seeds",
      "--plan",
      join(root, PLAN),
      "--now",
      "2026-10-02T07:40:00Z",
    ]);
    expect(code).toBe(0);
    const after = readFileSync(join(root, "docs/backlog.md"), "utf8");
    expect(after.startsWith(existing)).toBe(true);
    const added = after.slice(existing.length).split("\n").filter(Boolean);
    expect(added).toEqual([
      "- ui-quality: marketing r4 — accessibility/axe-moderate (rubric v1) (from: session:2026-10-02)",
    ]);
    for (const line of added) expect(line).toMatch(PROTOCOL);
    expect(out.trim()).toBe(added.join("\n"));
    expect(p.seeds).toHaveLength(2);
  });
});

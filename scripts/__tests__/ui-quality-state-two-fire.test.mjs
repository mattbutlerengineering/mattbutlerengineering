/**
 * Two-fire simulation of the ui-quality loop's state channel — Review C1's
 * re-verify condition (docs/features/ui-quality-loop/review.md § C1, "route to
 * Implement, re-verify with a two-fire simulation") under Architect re-entry 5.
 *
 * Fire 1 files an issue, records a `failed` calibration and audits 40 routes,
 * then pushes `ui-quality/ledger` and nobody merges its PR. `main` moves on (a
 * router change with its regen, a human backlog line). Fire 2 starts from a
 * fresh clone, exactly as the sandbox does, and must read fire 1's state: its
 * plan skips the filed key instead of refiling it, the failed calibration key
 * is not re-run, and the audited routes are not re-planned. The negative arm
 * deletes the unmerged branch: fire 2 then reads `main`'s empty ledger, and
 * `--labelled-issues` is what stops the refile.
 *
 * Every step runs the real CLI `main()` against a real clone of a temp bare
 * `origin`; only the router inventory (`routes.json`) is a fixture.
 */

import { beforeAll, describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_BRANCH, createDeps, main as stateMain } from "../ui-quality/state.mjs";
import { findingKey, main as findingsMain } from "../ui-quality/findings.mjs";
import { titleFor } from "../ui-quality/findings-plan.mjs";
import { main as rateMain } from "../ui-quality/rate.mjs";
import { parseLedger } from "../ui-quality/ledger.mjs";
import {
  BACKLOG,
  CALIBRATIONS,
  LEDGER,
  MODEL_ID,
  commitAndPush,
  createStateRemote,
  git,
  ledgerRunner,
  pageRoutes,
  readRel,
  remoteSha,
  writeRel,
} from "./fixtures/ui-quality-state-repo.mjs";

const FIRE1_AT = "2026-10-01T07:40:00Z";
const FIRE2_AT = "2026-10-02T07:40:00Z";
const DEAD = {
  app: "marketing",
  route: "page-00",
  tell: "bugs/dead-in-app-link",
  severity: "P1",
  evidence: { message: "1 dead in-app link: /nowhere", screenshot_sha256: "a".repeat(64) },
};

/** Run a CLI `main` in `dir`, capturing output. */
function cli(fn, args, dir, deps = {}) {
  const out = [];
  const err = [];
  const code = fn([...args, "--root", dir], {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    ...deps,
  });
  return { code, out: out.join(""), err: err.join("") };
}

/** Step (0): `state.mjs checkout` with the fixture's router inventory. */
const checkout = (dir) => {
  const r = cli(stateMain, ["checkout"], dir, { ...createDeps(dir), ledger: ledgerRunner(dir) });
  return { ...r, json: r.code === 0 ? JSON.parse(r.out) : null };
};

const rubricOf = (dir) => JSON.parse(readRel(dir, "docs/ui-quality/rubric.json"));

/** Fire 1: file DEAD as #101, record a failed calibration, audit 40 routes, push the branch. */
function fireOne(fixture) {
  const dir = fixture.clone("fire1");
  expect(checkout(dir).json).toMatchObject({ source: "main", branch: STATE_BRANCH });
  const rubric = rubricOf(dir);
  const key = findingKey(DEAD, rubric.rubric_version);
  writeRel(
    dir,
    ".ui-quality/findings.executed.json",
    JSON.stringify({
      actions: [{ key, action: "create", issue: 101, carrier: "issue", severity: "P1" }],
      seeds: [],
    })
  );
  const recorded = cli(
    findingsMain,
    ["record", "--executed", join(dir, ".ui-quality/findings.executed.json"), "--now", FIRE1_AT],
    dir
  );
  expect(recorded.code).toBe(0);
  const setSha = createHash("sha256")
    .update(readFileSync(join(dir, "docs/ui-quality/calibration.json")))
    .digest("hex");
  const calibrationKey = {
    model_id: MODEL_ID,
    rubric_version: rubric.rubric_version,
    set_sha256: setSha,
  };
  writeRel(
    dir,
    CALIBRATIONS,
    JSON.stringify({
      ts: FIRE1_AT,
      ...calibrationKey,
      labelled_at: "2026-09-30T00:00:00Z",
      pairs: 10,
      agreement: 0.6,
      inversions: 1,
      pass: false,
      pass_mark: rubric.calibration.pass_mark,
    }) + "\n"
  );
  const audited = parseLedger(readRel(dir, LEDGER)).map((r, i) =>
    i < 40
      ? {
          ...r,
          last_audited_at: FIRE1_AT,
          rubric_version: rubric.rubric_version,
          reachability: "ok",
        }
      : r
  );
  writeRel(dir, LEDGER, audited.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeRel(
    dir,
    BACKLOG,
    `${readRel(dir, BACKLOG)}- ui-quality: a routine seed (from: session:2026-10-01)\n`
  );
  commitAndPush(dir, "chore(ui-quality): ledger 2026-10-01", STATE_BRANCH);
  return {
    key,
    auditedRoutes: audited.slice(0, 40).map((r) => `${r.app}|${r.route}`),
    calibrationKey,
  };
}

/** `main` moves on: a router change (plus the regen main's CI enforces) and a human backlog line. */
function mainMovesOn(fixture) {
  const dir = fixture.clone("human");
  const routes = [...JSON.parse(readRel(dir, "routes.json")), ...pageRoutes(1, "brand-new")];
  writeRel(dir, "routes.json", JSON.stringify(routes, null, 2) + "\n");
  expect(ledgerRunner(dir)("generate")).toBe(0);
  writeRel(dir, BACKLOG, `${readRel(dir, BACKLOG)}- a human seed (from: session:2026-10-02)\n`);
  commitAndPush(dir, "feat(marketing): brand-new page", "main");
}

/** Fire 1's filed issue as routine step 6b's `search_issues` reports it. */
const FILED_101 = { number: 101, title: titleFor(DEAD, 1), state: "open" };

function planIn(dir, labelled) {
  writeRel(dir, ".ui-quality/in/mechanical.json", JSON.stringify([DEAD]));
  writeRel(dir, ".ui-quality/in/states.json", JSON.stringify({ 101: "open" }));
  writeRel(dir, ".ui-quality/in/labelled.json", JSON.stringify(labelled));
  const r = cli(
    findingsMain,
    [
      "plan",
      "--findings",
      join(dir, ".ui-quality/in/mechanical.json"),
      "--issue-states",
      join(dir, ".ui-quality/in/states.json"),
      "--labelled-issues",
      join(dir, ".ui-quality/in/labelled.json"),
      "--calibration-status",
      "stale",
    ],
    dir
  );
  const planPath = join(dir, ".ui-quality/findings.plan.json");
  return { ...r, plan: existsSync(planPath) ? JSON.parse(readFileSync(planPath, "utf8")) : null };
}

describe("two-fire simulation — fire 2 reads fire 1's unmerged state", () => {
  let fixture, fire1, fire1Tip, dir, state;
  beforeAll(() => {
    fixture = createStateRemote({ routes: pageRoutes(45) });
    fire1 = fireOne(fixture);
    mainMovesOn(fixture);
    fire1Tip = remoteSha(fixture.remote, STATE_BRANCH);
    dir = fixture.clone("fire2");
    state = checkout(dir);
  });

  it("fire 1's branch is on origin and unmerged into main", () => {
    expect(fire1Tip).not.toBeNull();
    // `--is-ancestor` exits 1 (git() throws) when the tip is not in main.
    expect(() => git(fixture.remote, ["merge-base", "--is-ancestor", fire1Tip, "main"])).toThrow();
  });

  it("state.mjs checkout reads the branch (source branch), resolving ledger and backlog by rule", () => {
    expect(state.code).toBe(0);
    expect(state.json).toMatchObject({ source: "branch", branch: STATE_BRANCH });
    expect(state.json.resolved).toEqual([BACKLOG, LEDGER]);
    expect(git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe(STATE_BRANCH);
  });

  it("main's new ledger row is present and fire 1's audit columns are kept", () => {
    const rows = parseLedger(readRel(dir, LEDGER));
    expect(rows).toHaveLength(46);
    expect(rows.find((r) => r.route === "brand-new-00")).toMatchObject({ last_audited_at: null });
    const audited = rows.filter((r) => r.last_audited_at === FIRE1_AT);
    expect(audited.map((r) => `${r.app}|${r.route}`)).toEqual(fire1.auditedRoutes);
    expect(ledgerRunner(dir)("check")).toBe(0);
  });

  it("both sides' backlog lines survive", () => {
    const backlog = readRel(dir, BACKLOG);
    expect(backlog).toContain("- ui-quality: a routine seed");
    expect(backlog).toContain("- a human seed");
  });

  it("findings plan with {101: open} skips the filed key — no refile", () => {
    const { code, plan } = planIn(dir, [FILED_101]);
    expect(code).toBe(0);
    expect(plan.actions).toEqual([
      expect.objectContaining({ key: fire1.key, action: "skip", issue: 101 }),
    ]);
    expect(plan.actions.filter((a) => a.action === "create")).toEqual([]);
  });

  it("calibration-status for fire 1's failed key exits 1 — no re-calibration", () => {
    const r = cli(rateMain, ["calibration-status", "--model-id", MODEL_ID], dir);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ key: fire1.calibrationKey, status: "failed" });
  });

  it("ledger.mjs due excludes every route fire 1 audited", () => {
    const run = ledgerRunner(dir, { now: () => FIRE2_AT, fixtures: {} });
    expect(run("due")).toBe(0);
    const due = JSON.parse(readRel(dir, ".ui-quality/due.json")).due.map(
      (d) => `${d.app}|${d.route}`
    );
    expect(due.length).toBeGreaterThan(0);
    expect(due).toContain("marketing|brand-new-00");
    expect(due.filter((k) => fire1.auditedRoutes.includes(k))).toEqual([]);
  });

  it("nothing fire 2 did pushed anything", () => {
    expect(remoteSha(fixture.remote, STATE_BRANCH)).toBe(fire1Tip);
  });
});

describe("two-fire simulation — negative: the unmerged branch is deleted", () => {
  let fixture, dir, state;
  beforeAll(() => {
    fixture = createStateRemote({ routes: pageRoutes(45) });
    fireOne(fixture);
    const deleter = fixture.clone("deleter");
    git(deleter, ["push", "--quiet", "origin", "--delete", STATE_BRANCH]);
    dir = fixture.clone("fire2");
    state = checkout(dir);
  });

  it("fire 2 falls back to main's state (source main)", () => {
    expect(remoteSha(fixture.remote, STATE_BRANCH)).toBeNull();
    expect(state.json).toMatchObject({ source: "main" });
    expect(JSON.parse(readRel(dir, "metrics/ui-quality-findings.json"))).toEqual({});
  });

  // Re-review N3: #101 carries its finding's title, so the lost state
  // self-heals — adopted under its key and skipped, never refiled.
  it("findings plan adopts the filed #101 by its title and does not refile it", () => {
    const { code, plan, err } = planIn(dir, [FILED_101]);
    expect(code).toBe(0);
    expect(err).toContain("adopted #101");
    expect(plan.actions).toEqual([
      expect.objectContaining({ key: findingKey(DEAD, 1), action: "skip", issue: 101 }),
    ]);
  });

  it("an unknown #101 whose title is no finding title exits 2, names it and plans nothing", () => {
    const { code, plan, err } = planIn(dir, [{ ...FILED_101, title: "a hand-labelled issue" }]);
    expect(code).toBe(2);
    expect(err).toContain("#101");
    expect(plan).toBeNull();
  });
});

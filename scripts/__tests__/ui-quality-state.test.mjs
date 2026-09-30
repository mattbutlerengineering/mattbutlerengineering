/**
 * state.mjs checkout — the ui-quality loop's state channel
 * (docs/features/ui-quality-loop/architecture.md § Components "Loop state
 * channel", § Interfaces `state.mjs checkout`; Architect re-entry 5, Review C1).
 *
 * Real git against a temp bare `origin`: the conflict mechanics are the point,
 * so nothing here fakes a merge. Only failures git cannot be made to produce on
 * demand (a failed fetch, a failed generate/check) are injected.
 */

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STATE_BRANCH, checkoutState, createDeps, main } from "../ui-quality/state.mjs";
import { parseLedger } from "../ui-quality/ledger.mjs";
import {
  BACKLOG,
  FINDINGS,
  LEDGER,
  commitAndPush,
  createStateRemote,
  git,
  ledgerRunner,
  pageRoutes,
  readRel,
  remoteSha,
  writeRel,
} from "./fixtures/ui-quality-state-repo.mjs";

/** state.mjs deps for `dir`: the real git binding, the fixture's ledger inventory. */
function depsFor(dir, overrides = {}) {
  return { ...createDeps(dir), ledger: ledgerRunner(dir), ...overrides };
}

function run(dir, overrides = {}) {
  const out = [];
  const err = [];
  const code = main(["checkout", "--root", dir], {
    ...depsFor(dir, overrides),
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  return {
    code,
    out: out.join(""),
    err: err.join(""),
    json: code === 0 ? JSON.parse(out.join("")) : null,
  };
}

const head = (dir) => git(dir, ["rev-parse", "HEAD"]);
const branchOf = (dir) => git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
const isClean = (dir) => git(dir, ["status", "--porcelain", "--untracked-files=no"]) === "";
const merging = (dir) => existsSync(join(dir, ".git", "MERGE_HEAD"));

/** A fire's state branch pushed from `origin/main` with `mutate` applied. */
function pushStateBranch(fixture, mutate, name = "fire1") {
  const dir = fixture.clone(name);
  git(dir, ["checkout", "--quiet", "-b", STATE_BRANCH]);
  mutate(dir);
  commitAndPush(dir, "chore(ui-quality): ledger 2026-10-01", STATE_BRANCH);
  return dir;
}

/** Advance origin/main with `mutate`. */
function advanceMain(fixture, mutate, name = "human") {
  const dir = fixture.clone(name);
  mutate(dir);
  commitAndPush(dir, "feat: main moves on", "main");
  return dir;
}

function auditRows(dir, count) {
  const rows = parseLedger(readRel(dir, LEDGER)).map((r, i) =>
    i < count
      ? { ...r, last_audited_at: "2026-10-01T07:40:00Z", rubric_version: 1, reachability: "ok" }
      : r
  );
  writeRel(dir, LEDGER, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

describe("state.mjs checkout — no remote state branch", () => {
  it("creates ui-quality/ledger from origin/main (source main) and pushes nothing", () => {
    const fixture = createStateRemote();
    const dir = fixture.clone("fire");
    const { code, json } = run(dir);
    expect(code).toBe(0);
    expect(json).toMatchObject({
      source: "main",
      branch: STATE_BRANCH,
      merged_main: null,
      resolved: [],
    });
    expect(branchOf(dir)).toBe(STATE_BRANCH);
    expect(json.head).toBe(git(dir, ["rev-parse", "origin/main"]));
    expect(remoteSha(fixture.remote, STATE_BRANCH)).toBeNull();
  });
});

describe("state.mjs checkout — remote state branch exists", () => {
  it("checks it out and merges origin/main in (source branch), pushing nothing", () => {
    const fixture = createStateRemote();
    pushStateBranch(fixture, (d) => auditRows(d, 3));
    advanceMain(fixture, (d) => writeRel(d, "README.md", "fixture, moved on\n"));
    const pushed = remoteSha(fixture.remote, STATE_BRANCH);
    const dir = fixture.clone("fire2");
    const { code, json } = run(dir);
    expect(code).toBe(0);
    expect(json).toMatchObject({ source: "branch", branch: STATE_BRANCH, resolved: [] });
    expect(json.merged_main).toBe(git(dir, ["rev-parse", "origin/main"]));
    expect(branchOf(dir)).toBe(STATE_BRANCH);
    expect(readRel(dir, "README.md")).toBe("fixture, moved on\n");
    expect(parseLedger(readRel(dir, LEDGER)).filter((r) => r.last_audited_at)).toHaveLength(3);
    expect(isClean(dir)).toBe(true);
    expect(remoteSha(fixture.remote, STATE_BRANCH)).toBe(pushed);
  });

  it("a ledger conflict keeps the branch's audit columns and main's identity columns; check passes", () => {
    const fixture = createStateRemote();
    pushStateBranch(fixture, (d) => auditRows(d, 40));
    advanceMain(fixture, (d) => {
      const routes = [...JSON.parse(readRel(d, "routes.json")), ...pageRoutes(1, "brand-new")];
      writeRel(d, "routes.json", JSON.stringify(routes, null, 2) + "\n");
      expect(ledgerRunner(d)("generate")).toBe(0);
    });
    const dir = fixture.clone("fire2");
    const { code, json } = run(dir);
    expect(code).toBe(0);
    expect(json.resolved).toEqual([LEDGER]);
    const rows = parseLedger(readRel(dir, LEDGER));
    expect(rows).toHaveLength(46);
    expect(rows.find((r) => r.route === "brand-new-00")).toMatchObject({ last_audited_at: null });
    expect(rows.filter((r) => r.last_audited_at === "2026-10-01T07:40:00Z")).toHaveLength(40);
    expect(ledgerRunner(dir)("check")).toBe(0);
    expect(isClean(dir)).toBe(true);
  });

  it("a findings conflict keeps the branch's side", () => {
    const fixture = createStateRemote();
    const branchSide = { "k|a|r1|t": { issue: 101 }, "k|b|r1|t": { issue: 102 } };
    pushStateBranch(fixture, (d) => writeRel(d, FINDINGS, JSON.stringify(branchSide) + "\n"));
    advanceMain(fixture, (d) =>
      writeRel(d, FINDINGS, JSON.stringify({ "k|a|r1|t": { issue: 101 } }) + "\n")
    );
    const dir = fixture.clone("fire2");
    const { code, json } = run(dir);
    expect(code).toBe(0);
    expect(json.resolved).toEqual([FINDINGS]);
    expect(JSON.parse(readRel(dir, FINDINGS))).toEqual(branchSide);
  });

  it("a docs/backlog.md conflict keeps both sides' lines", () => {
    const fixture = createStateRemote();
    pushStateBranch(fixture, (d) =>
      writeRel(d, BACKLOG, `${readRel(d, BACKLOG)}- routine seed (from: session:2026-10-01)\n`)
    );
    advanceMain(fixture, (d) =>
      writeRel(d, BACKLOG, `${readRel(d, BACKLOG)}- human seed (from: session:2026-10-01)\n`)
    );
    const dir = fixture.clone("fire2");
    const { code, json } = run(dir);
    expect(code).toBe(0);
    expect(json.resolved).toEqual([BACKLOG]);
    const backlog = readRel(dir, BACKLOG);
    expect(backlog).toContain("- a seed already on main");
    expect(backlog).toContain("- routine seed");
    expect(backlog).toContain("- human seed");
    expect(backlog).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
  });

  it("any other conflicted path exits 2 with the merge aborted at the branch's clean tip", () => {
    const fixture = createStateRemote();
    pushStateBranch(fixture, (d) => writeRel(d, "README.md", "branch side\n"));
    advanceMain(fixture, (d) => writeRel(d, "README.md", "main side\n"));
    const tip = remoteSha(fixture.remote, STATE_BRANCH);
    const dir = fixture.clone("fire2");
    const { code, err } = run(dir);
    expect(code).toBe(2);
    expect(err).toContain("state-unavailable");
    expect(err).toContain("README.md");
    expect(branchOf(dir)).toBe(STATE_BRANCH);
    expect(head(dir)).toBe(tip);
    expect(merging(dir)).toBe(false);
    expect(isClean(dir)).toBe(true);
    expect(remoteSha(fixture.remote, STATE_BRANCH)).toBe(tip);
  });

  it.each(["generate", "check"])(
    "a failed ledger %s after a ledger conflict exits 2, merge aborted, clean tip",
    (failing) => {
      const fixture = createStateRemote();
      pushStateBranch(fixture, (d) => auditRows(d, 5));
      advanceMain(fixture, (d) => {
        const routes = [...JSON.parse(readRel(d, "routes.json")), ...pageRoutes(1, "brand-new")];
        writeRel(d, "routes.json", JSON.stringify(routes, null, 2) + "\n");
        expect(ledgerRunner(d)("generate")).toBe(0);
      });
      const tip = remoteSha(fixture.remote, STATE_BRANCH);
      const dir = fixture.clone("fire2");
      const real = ledgerRunner(dir);
      const { code, err } = run(dir, { ledger: (cmd) => (cmd === failing ? 1 : real(cmd)) });
      expect(code).toBe(2);
      expect(err).toContain(failing);
      expect(head(dir)).toBe(tip);
      expect(merging(dir)).toBe(false);
      expect(isClean(dir)).toBe(true);
    }
  );

  it("a failed fetch exits 2 and merges nothing, leaving the branch at its tip", () => {
    const fixture = createStateRemote();
    pushStateBranch(fixture, (d) => auditRows(d, 1));
    const tip = remoteSha(fixture.remote, STATE_BRANCH);
    const dir = fixture.clone("fire2");
    advanceMain(fixture, (d) => writeRel(d, "README.md", "after the clone\n"));
    const realGit = createDeps(dir).git;
    const { code, err } = run(dir, {
      git: (args, opts) =>
        args[0] === "fetch"
          ? { ok: false, stdout: "", stderr: "network down" }
          : realGit(args, opts),
    });
    expect(code).toBe(2);
    expect(err).toContain("fetch");
    expect(branchOf(dir)).toBe(STATE_BRANCH);
    expect(head(dir)).toBe(tip);
    expect(isClean(dir)).toBe(true);
  });
});

describe("state.mjs — module shape", () => {
  it("checkoutState is the pure core: every effect goes through the injected deps", () => {
    const calls = [];
    const result = checkoutState({
      git: (args) => {
        calls.push(args.join(" "));
        return { ok: false, stdout: "", stderr: "no git here" };
      },
      ledger: () => 0,
      mergeUnion: () => "",
      writeFile: () => {},
    });
    expect(result.code).toBe(2);
    expect(calls[0]).toBe("fetch origin");
    expect(calls.some((c) => c.startsWith("push"))).toBe(false);
  });

  it("an unknown subcommand exits 2", () => {
    expect(main(["nope"], { stdout: () => {}, stderr: () => {} })).toBe(2);
  });
});

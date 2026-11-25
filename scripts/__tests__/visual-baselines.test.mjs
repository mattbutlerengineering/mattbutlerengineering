import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BASELINE_PREFIX,
  buildBaselineRefName,
  fetchBaseline,
  parseBaselineRefName,
  parseLsRemote,
  pickBaseline,
  publishBaseline,
} from "../visual-baselines.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);

describe("baseline ref names", () => {
  it("names one ref per suite and main commit", () => {
    expect(buildBaselineRefName({ suite: "rialto-web", sha: SHA_A })).toBe(
      `${BASELINE_PREFIX}/rialto-web/${SHA_A}`
    );
  });

  it("uses a prefix distinct from the visual-diffs namespace", () => {
    expect(BASELINE_PREFIX).toBe("visual-baselines");
  });

  it("rejects a suite that is not one lowercase path segment", () => {
    expect(() => buildBaselineRefName({ suite: "Rialto/Web", sha: SHA_A })).toThrow(/suite/);
  });

  it("rejects anything but a full 40-hex sha", () => {
    expect(() => buildBaselineRefName({ suite: "rialto-web", sha: "abc123" })).toThrow(/sha/);
  });

  it("round-trips through parseBaselineRefName", () => {
    const name = buildBaselineRefName({ suite: "marketing", sha: SHA_B });
    expect(parseBaselineRefName(name)).toEqual({ suite: "marketing", sha: SHA_B });
  });

  it("returns null for refs outside the namespace", () => {
    expect(parseBaselineRefName(`visual-diffs/pr-1/rialto-web/run-1-attempt-1`)).toBeNull();
    expect(parseBaselineRefName("main")).toBeNull();
  });
});

describe("parseLsRemote", () => {
  it("strips refs/heads/ and drops lines that are not baseline refs", () => {
    const output = [
      `${SHA_C}\trefs/heads/${BASELINE_PREFIX}/rialto-web/${SHA_A}`,
      `${SHA_C}\trefs/heads/main`,
      "",
    ].join("\n");
    expect(parseLsRemote(output)).toEqual([`${BASELINE_PREFIX}/rialto-web/${SHA_A}`]);
  });
});

describe("pickBaseline", () => {
  const refNames = [
    buildBaselineRefName({ suite: "rialto-web", sha: SHA_B }),
    buildBaselineRefName({ suite: "marketing", sha: SHA_A }),
  ];

  it("picks the nearest ancestor that has a baseline for the suite", () => {
    expect(
      pickBaseline({ suite: "rialto-web", ancestors: [SHA_A, SHA_B, SHA_C], refNames })
    ).toEqual({
      sha: SHA_B,
      refName: refNames[0],
      distance: 1,
    });
  });

  it("ignores another suite's baseline at a nearer ancestor", () => {
    expect(pickBaseline({ suite: "rialto-web", ancestors: [SHA_A, SHA_B], refNames }).sha).toBe(
      SHA_B
    );
  });

  it("returns null when no ancestor has one", () => {
    expect(pickBaseline({ suite: "hospitality", ancestors: [SHA_A, SHA_B], refNames })).toBeNull();
  });
});

describe("publishBaseline + fetchBaseline round trip", () => {
  let root;
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "visual-baselines-test-"));
    git(root, "init", "-q", "--bare", "remote.git");
    git(root, "init", "-q", "-b", "main", "work");
    const work = join(root, "work");
    git(work, "config", "user.email", "t@example.com");
    git(work, "config", "user.name", "t");
    git(work, "remote", "add", "origin", join(root, "remote.git"));
    writeFileSync(join(work, "f.txt"), "1");
    git(work, "add", ".");
    git(work, "commit", "-qm", "one");
    git(work, "push", "-q", "origin", "main");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("publishes the PNGs of a main commit and plants them into a PR checkout's folder", () => {
    const work = join(root, "work");
    const mainSha = git(work, "rev-parse", "HEAD");
    const shots = join(root, "shots");
    mkdirSync(shots);
    writeFileSync(join(shots, "button.png"), "png-1");
    writeFileSync(join(shots, "card.png"), "png-2");
    writeFileSync(join(shots, "notes.txt"), "ignored");

    const published = publishBaseline({ dir: shots, suite: "rialto-web", sha: mainSha, cwd: work });
    expect(published.refName).toBe(buildBaselineRefName({ suite: "rialto-web", sha: mainSha }));
    expect(published.count).toBe(2);
    expect(git(work, "status", "--porcelain")).toBe("");

    // A later main commit with no baseline of its own: the PR still finds the older one.
    writeFileSync(join(work, "f.txt"), "2");
    git(work, "commit", "-qam", "two");
    git(work, "push", "-q", "origin", "main");

    const target = join(root, "target");
    mkdirSync(target);
    writeFileSync(join(target, "card.png"), "tracked-old");
    writeFileSync(join(target, "pr-added.png"), "new-in-pr");
    const fetched = fetchBaseline({
      dir: target,
      suite: "rialto-web",
      base: "origin/main",
      cwd: work,
    });

    expect(fetched).toMatchObject({ sha: mainSha, distance: 1, count: 2 });
    // Baseline files replace same-named tracked ones; a snapshot the PR itself
    // adds has no baseline yet and must survive, or its new test goes red.
    expect(readdirSync(target).sort()).toEqual(["button.png", "card.png", "pr-added.png"]);
    expect(readFileSync(join(target, "pr-added.png"), "utf8")).toBe("new-in-pr");
    expect(readFileSync(join(target, "card.png"), "utf8")).toBe("png-2");
  });

  it("leaves the folder untouched and returns null when no baseline exists", () => {
    const work = join(root, "work");
    git(work, "fetch", "-q", "origin");
    const target = join(root, "target");
    mkdirSync(target);
    writeFileSync(join(target, "committed.png"), "keep");

    expect(
      fetchBaseline({ dir: target, suite: "rialto-web", base: "origin/main", cwd: work })
    ).toBeNull();
    expect(readdirSync(target)).toEqual(["committed.png"]);
  });

  it("refuses to publish an empty folder", () => {
    const work = join(root, "work");
    const empty = join(root, "empty");
    mkdirSync(empty);
    expect(() =>
      publishBaseline({
        dir: empty,
        suite: "rialto-web",
        sha: git(work, "rev-parse", "HEAD"),
        cwd: work,
      })
    ).toThrow(/no PNG/);
  });
});

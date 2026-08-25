import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLISHER_LOGIN,
  artifactFilePath,
  buildOrphanCommit,
  commentArgs,
  formatSkipNote,
  isRetryable,
  isStandingComment,
  planComment,
  plannedImageFiles,
  readBudget,
  resolvePlaywrightConfigPath,
} from "../publish-visual-diffs.mjs";
import { decideCommentAction, COMMENT_MARKER_PREFIX } from "../visual-diff-comment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, "../publish-visual-diffs.mjs"), "utf8");

let sandbox;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "visual-diff-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Thinness — this module is the ONLY impure edge, and it holds no rule a test
// would want to reach.
// ---------------------------------------------------------------------------

describe("publish-visual-diffs.mjs is a thin caller", () => {
  it("imports all three pure modules", () => {
    expect(SRC).toContain('from "./visual-diff-report.mjs"');
    expect(SRC).toContain('from "./visual-diff-comment.mjs"');
    expect(SRC).toContain('from "./visual-diff-refs.mjs"');
  });

  it("defines no comparator — ordering belongs to selectDisplayed", () => {
    expect(SRC).not.toMatch(/\.sort\(/);
  });

  it("holds no pixel-budget literal", () => {
    // The unextended version of this test would have passed a module that
    // quietly re-derived the budget.
    expect(SRC).not.toContain("300");
    expect(SRC).not.toContain("maxDiffPixel");
  });

  it("re-implements no report parsing", () => {
    expect(SRC).not.toMatch(/pixels \(ratio/);
    expect(SRC).not.toContain("-actual.png");
  });

  it("re-implements no marker parsing or staleness comparison", () => {
    expect(SRC).not.toContain("visual-diffs-in-pr run=");
    expect(SRC).not.toMatch(/runAttempt\s*>=?/);
  });

  it("never force-pushes", () => {
    // The run-scoped naming scheme removes the lost-update race; a force-push
    // reintroduces it, orphaning the commit a standing comment points at.
    expect(SRC).not.toContain("--force");
  });

  it("names the diff ref from the FULL run ordinal, attempt included", () => {
    // GITHUB_RUN_ID is stable across "Re-run failed jobs"; only
    // GITHUB_RUN_ATTEMPT moves. A ref built from the id alone points attempt 2
    // at attempt 1's ref, the push is rejected non-fast-forward, --force is
    // banned by the test above, and the publisher dies with attempt 1's images
    // still standing in the comment — SC-4 undemonstrated.
    expect(SRC).toMatch(/buildRefName\(\{[^)]*runAttempt[^)]*\}\)/);
  });

  it("shells out only through execFileSync with argv arrays", () => {
    expect(SRC).toContain("execFileSync");
    expect(SRC).not.toContain("execSync");
    expect(SRC).not.toContain('child_process").exec');
  });
});

// ---------------------------------------------------------------------------
// The budget hand-off
// ---------------------------------------------------------------------------

describe("resolvePlaywrightConfigPath", () => {
  const WS = "/home/runner/work/repo/repo";

  it("re-roots the report's absolute configFile against the workspace", () => {
    expect(resolvePlaywrightConfigPath(`${WS}/apps/rialto-web/playwright.config.ts`, WS)).toBe(
      "apps/rialto-web/playwright.config.ts"
    );
  });

  it("returns null when configFile is absent", () => {
    expect(resolvePlaywrightConfigPath(undefined, WS)).toBeNull();
    expect(resolvePlaywrightConfigPath(null, WS)).toBeNull();
    expect(resolvePlaywrightConfigPath("", WS)).toBeNull();
  });

  it("returns null when configFile escapes the workspace", () => {
    expect(resolvePlaywrightConfigPath("/etc/passwd", WS)).toBeNull();
    expect(resolvePlaywrightConfigPath(`${WS}/../elsewhere/playwright.config.ts`, WS)).toBeNull();
  });

  it("returns null when the workspace is unknown", () => {
    expect(resolvePlaywrightConfigPath("/a/b/playwright.config.ts", undefined)).toBeNull();
  });
});

describe("readBudget", () => {
  it("reads the config as text and hands it to the parser", () => {
    const configDir = join(sandbox, "apps/rialto-web");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "playwright.config.ts"),
      "expect: { toHaveScreenshot: { maxDiffPixels: 421 } },\n"
    );
    expect(
      readBudget({
        configFile: join(configDir, "playwright.config.ts"),
        workspace: sandbox,
      })
    ).toBe(421);
  });

  it("no-ops to null when configFile is absent", () => {
    expect(readBudget({ configFile: undefined, workspace: sandbox })).toBeNull();
  });

  it("no-ops to null when configFile escapes the workspace", () => {
    expect(readBudget({ configFile: "/etc/hosts", workspace: sandbox })).toBeNull();
  });

  it("no-ops to null when the file is not in the checkout", () => {
    expect(
      readBudget({ configFile: join(sandbox, "nope/playwright.config.ts"), workspace: sandbox })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Artifact path mapping
// ---------------------------------------------------------------------------

describe("artifactFilePath", () => {
  it("maps a report path onto the downloaded artifact", () => {
    expect(
      artifactFilePath(
        "/home/runner/work/r/r/apps/rialto-web/e2e/test-results/visual-light-x-chromium/light-x-actual.png",
        "/tmp/diffs"
      )
    ).toBe("/tmp/diffs/visual-light-x-chromium/light-x-actual.png");
  });

  it("returns null for a path outside test-results/", () => {
    expect(artifactFilePath("/w/apps/rialto-web/e2e/screenshots/light-x.png", "/tmp/d")).toBeNull();
    expect(artifactFilePath(null, "/tmp/d")).toBeNull();
  });
});

describe("plannedImageFiles", () => {
  const rec = {
    name: "light-x",
    expectedPath: "/w/e2e/test-results/visual-light-x-chromium/light-x-expected.png",
    actualPath: "/w/e2e/test-results/visual-light-x-chromium/light-x-actual.png",
    diffPath: "/w/e2e/test-results/visual-light-x-chromium/light-x-diff.png",
  };

  const present = () => true;

  it("names each blob exactly as the comment addresses it", () => {
    const files = plannedImageFiles([rec], "/tmp/d", present);
    expect(files.map((f) => f.name)).toEqual([
      "light-x-expected.png",
      "light-x-actual.png",
      "light-x-diff.png",
    ]);
  });

  it("skips an image the run never wrote", () => {
    const files = plannedImageFiles(
      [{ ...rec, expectedPath: null, diffPath: null }],
      "/tmp/d",
      present
    );
    expect(files.map((f) => f.name)).toEqual(["light-x-actual.png"]);
  });

  // The existence guard used to sit in `main()` as a `.filter()` applied AFTER
  // this function returned, which put it outside every test — deleting it was a
  // surviving mutation. It is a parameter now, so a caller cannot forget it and
  // a test can supply one.
  it("drops a blob whose file is absent from the downloaded artifact", () => {
    const files = plannedImageFiles([rec], "/tmp/d", (path) => !path.endsWith("-diff.png"));
    expect(files.map((f) => f.name)).toEqual(["light-x-expected.png", "light-x-actual.png"]);
  });
});

// ---------------------------------------------------------------------------
// ONE derivation for the pushed blobs and the comment's <img> tags.
// ---------------------------------------------------------------------------

describe("planComment", () => {
  function rec(name) {
    const dir = `/w/e2e/test-results/visual-${name}-chromium`;
    return {
      name,
      pixels: 100,
      reason: "pixel-diff",
      expectedPath: `${dir}/${name}-expected.png`,
      actualPath: `${dir}/${name}-actual.png`,
      diffPath: `${dir}/${name}-diff.png`,
    };
  }
  const changed = ["a", "b", "c", "d", "e", "f", "g", "h"].map(rec);

  it("publishes a blob for every displayed record and nothing else", () => {
    const plan = planComment({ changed, artifactDir: "/tmp/d", exists: () => true });
    expect(plan.displayed).toHaveLength(6);
    expect(plan.files).toHaveLength(18);
    expect(plan.publishedBlobs).toEqual(plan.files.map((f) => f.name));
    for (const name of plan.publishedBlobs) {
      expect(plan.displayed.some((r) => name.startsWith(r.name))).toBe(true);
    }
  });

  it("keeps the two sets aligned at any cap", () => {
    for (const cap of [1, 3, 6]) {
      const plan = planComment({ changed, artifactDir: "/tmp/d", exists: () => true, cap });
      expect(plan.displayed).toHaveLength(cap);
      expect(plan.publishedBlobs).toHaveLength(cap * 3);
    }
  });

  it("never reports a blob it could not find on disk as published", () => {
    const plan = planComment({
      changed,
      artifactDir: "/tmp/d",
      exists: (path) => !path.endsWith("-diff.png"),
    });
    expect(plan.publishedBlobs.some((n) => n.endsWith("-diff.png"))).toBe(false);
    expect(plan.displayed).toHaveLength(6);
  });
});

describe("main derives the comment's images from the plan, never a second time", () => {
  it("hands renderComment the plan's own displayed records and blob names", () => {
    expect(SRC).toMatch(/renderComment\(\{[\s\S]*?displayed[\s\S]*?publishedBlobs[\s\S]*?\}\)/);
  });

  it("does not filter the planned files after the fact", () => {
    expect(SRC).not.toMatch(/\.filter\(\(f\) => existsSync/);
  });

  it("selects the displayed set exactly once, inside planComment", () => {
    expect(SRC.match(/selectDisplayed\(/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Git plumbing — the runner's working tree and index are never touched
// ---------------------------------------------------------------------------

describe("buildOrphanCommit", () => {
  function initRepo() {
    const repo = join(sandbox, "repo");
    mkdirSync(repo);
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    writeFileSync(join(repo, "tracked.txt"), "hello\n");
    git("add", "tracked.txt");
    git("commit", "-qm", "init");
    // Deliberate working-tree dirt: the PostToolUse prettier hook leaves this
    // repo permanently dirty, so "clean before" is not a safe precondition.
    writeFileSync(join(repo, "tracked.txt"), "changed\n");
    writeFileSync(join(repo, "untracked.txt"), "x\n");
    return { repo, git };
  }

  it("leaves git status --porcelain byte-identical", () => {
    const { repo, git } = initRepo();
    const before = git("status", "--porcelain");

    const images = join(sandbox, "images");
    mkdirSync(images);
    writeFileSync(join(images, "a-actual.png"), "PNGA");
    writeFileSync(join(images, "a-diff.png"), "PNGD");

    buildOrphanCommit({
      files: [
        { name: "a-actual.png", path: join(images, "a-actual.png") },
        { name: "a-diff.png", path: join(images, "a-diff.png") },
      ],
      message: "visual diffs",
      cwd: repo,
    });

    expect(git("status", "--porcelain")).toBe(before);
  });

  it("produces a parentless commit with a flat tree of exactly the named files", () => {
    const { repo, git } = initRepo();
    const images = join(sandbox, "images");
    mkdirSync(images);
    writeFileSync(join(images, "a-actual.png"), "PNGA");

    const sha = buildOrphanCommit({
      files: [{ name: "a-actual.png", path: join(images, "a-actual.png") }],
      message: "visual diffs",
      cwd: repo,
    });

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(git("cat-file", "-p", sha)).not.toContain("parent ");
    const tree = git("ls-tree", "--name-only", sha);
    expect(tree.trim().split("\n")).toEqual(["a-actual.png"]);
    expect(git("show", `${sha}:a-actual.png`)).toBe("PNGA");
  });

  it("returns null when there is nothing to publish", () => {
    const { repo } = initRepo();
    expect(buildOrphanCommit({ files: [], message: "m", cwd: repo })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The comment verbs — the caller executes and never decides
// ---------------------------------------------------------------------------

describe("commentArgs", () => {
  const base = { repo: "o/r", prNumber: 42, commentId: 99, bodyFile: "/tmp/body.md" };

  it("builds a POST for the post verb", () => {
    const args = commentArgs({ verb: "post", ...base });
    expect(args[0]).toBe("api");
    expect(args).toContain("repos/o/r/issues/42/comments");
    expect(args).toContain("POST");
  });

  it("builds a PATCH against the standing comment id", () => {
    const args = commentArgs({ verb: "patch", ...base });
    expect(args).toContain("repos/o/r/issues/comments/99");
    expect(args).toContain("PATCH");
  });

  it("builds a DELETE against the standing comment id", () => {
    const args = commentArgs({ verb: "delete", ...base });
    expect(args).toContain("repos/o/r/issues/comments/99");
    expect(args).toContain("DELETE");
  });

  it("builds nothing for skip", () => {
    expect(commentArgs({ verb: "skip", ...base })).toBeNull();
  });

  it("passes the body from a file, never interpolated into an argument", () => {
    expect(commentArgs({ verb: "post", ...base }).join(" ")).toContain("body=@/tmp/body.md");
  });
});

// ---------------------------------------------------------------------------
// Who owns the standing comment. This is an authorization check, not a lookup
// convenience: without it, ANY account that can comment on this public repo can
// permanently suppress the feature on a pull request.
// ---------------------------------------------------------------------------

describe("isStandingComment", () => {
  const marker = `${COMMENT_MARKER_PREFIX}500 attempt=1 -->\nbody\n`;

  it("accepts a marker comment written by the publisher's own identity", () => {
    expect(isStandingComment({ login: PUBLISHER_LOGIN, body: marker })).toBe(true);
  });

  // The suppression attack, stated concretely. On a public repo anyone who can
  // comment posts `<!-- visual-diffs-in-pr run=99999999999999 attempt=99 -->`.
  // An author-blind lookup adopts it as the standing comment, decideCommentAction
  // reads an ordinal no real run can ever exceed, and every later run — failing
  // and passing alike — returns `skip`. The only trace is one skip note inside a
  // green job's summary.
  it("REJECTS a marker comment written by anyone else, however plausible", () => {
    const hostile = `${COMMENT_MARKER_PREFIX}99999999999999 attempt=99 -->\n`;
    expect(isStandingComment({ login: "a-passing-contributor", body: hostile })).toBe(false);
    expect(isStandingComment({ login: "github-actions", body: hostile })).toBe(false);
    expect(isStandingComment({ login: "github-actions[bot] ", body: hostile })).toBe(false);
  });

  it("rejects the publisher's own comments that carry no marker", () => {
    expect(isStandingComment({ login: PUBLISHER_LOGIN, body: "Preview Deployed" })).toBe(false);
  });

  it("requires the marker at the START of the body, not merely somewhere in it", () => {
    expect(isStandingComment({ login: PUBLISHER_LOGIN, body: `quoted:\n${marker}` })).toBe(false);
  });

  it("never throws on a malformed or absent comment", () => {
    expect(isStandingComment(null)).toBe(false);
    expect(isStandingComment(undefined)).toBe(false);
    expect(isStandingComment({})).toBe(false);
    expect(isStandingComment({ login: PUBLISHER_LOGIN })).toBe(false);
    expect(isStandingComment({ login: PUBLISHER_LOGIN, body: 42 })).toBe(false);
  });
});

describe("the standing-comment lookup", () => {
  it("asks the API for each comment's author, so the check above has an input", () => {
    // A jq projection that omits `.user.login` makes isStandingComment
    // unreachable no matter how correct it is.
    expect(SRC).toContain("user.login");
  });
});

describe("isRetryable", () => {
  it("never retries the POST", () => {
    // A failed POST that actually landed would double-post, and two walls of
    // images is a worse outcome than none. The next run's marker lookup
    // repairs it.
    expect(isRetryable("post")).toBe(false);
  });

  it("retries the idempotent PATCH and DELETE", () => {
    expect(isRetryable("patch")).toBe(true);
    expect(isRetryable("delete")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Every skip is noted, never silent
// ---------------------------------------------------------------------------

describe("formatSkipNote", () => {
  const ours = { runId: "500", runAttempt: "2" };

  it("names both ordinals when a newer run owns the comment", () => {
    const note = formatSkipNote({ runOrdinal: ours, standingBody: markerBody("600", "1") });
    expect(note).toContain("500");
    expect(note).toContain("600");
  });

  it("says so explicitly in the degenerate cell where there is no standing ordinal", () => {
    const note = formatSkipNote({ runOrdinal: ours, standingBody: null });
    expect(note).toContain("500");
    expect(note.toLowerCase()).toContain("no standing comment");
  });

  it("says so when the standing ordinal is unreadable", () => {
    const note = formatSkipNote({ runOrdinal: ours, standingBody: "garbled" });
    expect(note.toLowerCase()).toContain("unreadable");
  });

  it("emits a non-empty note for every one of the four skip cells", () => {
    // Silence is exactly the property that made the delete-path version of this
    // bug invisible, and the note costs one line in a job nothing depends on.
    const cells = [
      { existingBody: null, visualFailed: false },
      { existingBody: markerBody("600", "1"), visualFailed: true },
      { existingBody: markerBody("600", "1"), visualFailed: false },
      { existingBody: "garbled", visualFailed: false },
    ];
    for (const cell of cells) {
      const verb = decideCommentAction({ ...cell, runOrdinal: ours });
      expect(verb).toBe("skip");
      const note = formatSkipNote({ runOrdinal: ours, standingBody: cell.existingBody });
      expect(note.length).toBeGreaterThan(0);
    }
  });
});

function markerBody(runId, attempt) {
  return `${COMMENT_MARKER_PREFIX}${runId} attempt=${attempt} -->\nbody\n`;
}

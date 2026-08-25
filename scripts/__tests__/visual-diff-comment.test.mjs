import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMENT_MARKER_PREFIX,
  MAX_IMAGE_ROWS,
  decideCommentAction,
  parseCommentOrdinal,
  renderComment,
  selectDisplayed,
} from "../visual-diff-comment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimal record in the shape parseVisualReport emits. */
function record(name, pixels, reason = "pixel-diff") {
  return {
    name,
    pixels,
    reason,
    expectedPath: `/w/test-results/${name}-expected.png`,
    actualPath: `/w/test-results/${name}-actual.png`,
    diffPath: `/w/test-results/${name}-diff.png`,
  };
}

// ---------------------------------------------------------------------------
// 2.1 — ordering and the display cap
// ---------------------------------------------------------------------------

describe("MAX_IMAGE_ROWS", () => {
  it("is an exported constant, not an env var", () => {
    expect(MAX_IMAGE_ROWS).toBe(6);
  });
});

describe("selectDisplayed", () => {
  it("orders descending by pixel count", () => {
    const selected = selectDisplayed([record("a", 100), record("b", 900), record("c", 500)], 6);
    expect(selected.map((r) => r.name)).toEqual(["b", "c", "a"]);
  });

  it("puts pixels: null first — the most alarming and least self-explanatory", () => {
    const selected = selectDisplayed(
      [record("a", 100), record("z", null, "missing-baseline"), record("b", 900)],
      6
    );
    expect(selected.map((r) => r.name)).toEqual(["z", "b", "a"]);
  });

  it("breaks ties by snapshot name", () => {
    const selected = selectDisplayed([record("zeta", 680), record("alpha", 680)], 6);
    expect(selected.map((r) => r.name)).toEqual(["alpha", "zeta"]);
  });

  it("breaks null-pixel ties by snapshot name too", () => {
    const selected = selectDisplayed([record("zeta", null), record("alpha", null)], 6);
    expect(selected.map((r) => r.name)).toEqual(["alpha", "zeta"]);
  });

  it("is deterministic for a shuffled input", () => {
    const input = [
      record("d", 10),
      record("a", 900),
      record("nullish", null),
      record("c", 500),
      record("b", 900),
    ];
    const shuffled = [input[3], input[0], input[4], input[2], input[1]];
    expect(selectDisplayed(input, 6).map((r) => r.name)).toEqual(
      selectDisplayed(shuffled, 6).map((r) => r.name)
    );
  });

  it("returns at most cap entries", () => {
    const many = Array.from({ length: 20 }, (_, i) => record(`s${i}`, i * 10));
    expect(selectDisplayed(many, MAX_IMAGE_ROWS)).toHaveLength(MAX_IMAGE_ROWS);
  });

  it("returns the whole list when it is shorter than the cap", () => {
    const few = [record("a", 1), record("b", 2)];
    expect(selectDisplayed(few, MAX_IMAGE_ROWS)).toHaveLength(2);
  });

  it("does not mutate its input", () => {
    const input = [record("a", 100), record("b", 900)];
    const before = input.map((r) => r.name);
    selectDisplayed(input, 6);
    expect(input.map((r) => r.name)).toEqual(before);
  });

  it("returns [] for an empty or missing list", () => {
    expect(selectDisplayed([], 6)).toEqual([]);
    expect(selectDisplayed(undefined, 6)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2.2 — the comment body
// ---------------------------------------------------------------------------

const SHA = "0f1e2d3c4b5a69788796a5b4c3d2e1f009182736";
const SLUG = "mattbutlerengineering/mattbutlerengineering";

const FIXTURE_CHANGED = [
  record("light-alpha", 5606),
  record("light-bravo", 2315),
  record("light-charlie", 1826),
  record("light-delta", 1200),
  record("light-echo", 839),
  record("light-foxtrot", 680),
  record("light-golf", 680),
  record("light-hotel", 579),
  { ...record("light-india", null, "missing-baseline"), expectedPath: null, diffPath: null },
];

/** Every blob name the publisher would write for `displayed`. */
function blobsFor(displayed) {
  return displayed.flatMap((rec) =>
    [rec.expectedPath, rec.actualPath, rec.diffPath]
      .filter(Boolean)
      .map((path) => path.split("/").pop())
  );
}

function render(overrides = {}) {
  const changed = overrides.changed ?? FIXTURE_CHANGED;
  const displayed = overrides.displayed ?? selectDisplayed(changed, MAX_IMAGE_ROWS);
  return renderComment({
    total: 49,
    changed,
    displayed,
    publishedBlobs: blobsFor(displayed),
    unchanged: 49 - changed.length,
    failedWithoutDiff: 0,
    budget: 300,
    sha: SHA,
    repoSlug: SLUG,
    runId: "32873184619",
    runAttempt: "1",
    ...overrides,
  });
}

describe("renderComment marker and heading", () => {
  it("puts the machine marker on the first line, exactly", () => {
    const first = render().split("\n")[0];
    expect(first).toBe("<!-- visual-diffs-in-pr run=32873184619 attempt=1 -->");
  });

  it("exposes the marker prefix so the caller can find the comment by substring", () => {
    expect(render()).toContain(COMMENT_MARKER_PREFIX);
  });

  it("heads with changed-of-total, both numbers from the report", () => {
    expect(render()).toContain(`## 🖼 Visual regression — ${FIXTURE_CHANGED.length} of 49 changed`);
  });
});

describe("renderComment image rows", () => {
  const body = render();
  const sections = body.match(/^### .*$/gm) ?? [];

  it("shows at most MAX_IMAGE_ROWS sections", () => {
    expect(sections).toHaveLength(MAX_IMAGE_ROWS);
  });

  it("shows the largest movers, nulls first", () => {
    expect(sections[0]).toContain("light-india");
    expect(sections[1]).toContain("light-alpha");
  });

  it("titles a section with the pixel count against the budget the caller passed", () => {
    expect(body).toContain("### light-alpha (5606 px over 300 budget)");
  });

  it("renders the reason, never the string `null px`, for an unmeasurable record", () => {
    expect(body).toContain("### light-india (missing-baseline)");
    expect(body).not.toContain("null px");
  });

  it("renders a three-column baseline | actual | diff table per section", () => {
    expect(body).toContain("| baseline | actual | diff |");
    const headerRows = body.match(/^\| baseline \| actual \| diff \|$/gm) ?? [];
    expect(headerRows).toHaveLength(MAX_IMAGE_ROWS);
  });

  it("addresses every image by commit SHA on raw.githubusercontent.com at width 250", () => {
    const srcs = [...body.matchAll(/<img src="([^"]+)" width="(\d+)"/g)];
    expect(srcs.length).toBeGreaterThan(0);
    for (const [, url, width] of srcs) {
      expect(url.startsWith(`https://raw.githubusercontent.com/${SLUG}/${SHA}/`)).toBe(true);
      expect(width).toBe("250");
    }
  });

  it("never addresses an image by ref name", () => {
    // A SHA is immutable; a ref name containing "/" cannot be told apart from
    // the path in a raw.githubusercontent.com URL.
    expect(body).not.toContain("visual-diffs/pr-");
    expect(body).not.toContain("refs/heads");
  });

  it("omits an image cell whose file was never written", () => {
    // A missing baseline has no expected image and no diff image; linking one
    // would 404 in the comment.
    const indiaSection = body.slice(body.indexOf("### light-india"));
    const row = indiaSection.split("\n").find((l) => l.includes("<img"));
    expect(row).toContain("light-india-actual.png");
    expect(row).not.toContain("light-india-expected.png");
    expect(row).not.toContain("light-india-diff.png");
  });
});

describe("renderComment overflow (SC-6)", () => {
  const body = render();

  it("states explicitly how many more there are", () => {
    expect(body).toContain(`${FIXTURE_CHANGED.length - MAX_IMAGE_ROWS} more changed snapshot`);
  });

  it("names the artifact as where the full set lives", () => {
    expect(body).toContain("rialto-web-visual-diffs");
  });

  it("lists every snapshot beyond the cap by name and pixel count", () => {
    for (const rec of ["light-foxtrot", "light-golf", "light-hotel"]) {
      expect(body).toContain(rec);
    }
    expect(body).toContain("579 px over 300 budget");
  });

  it("emits no overflow block when nothing overflows", () => {
    const body2 = render({ changed: FIXTURE_CHANGED.slice(0, 3) });
    expect(body2).not.toContain("more changed snapshot");
  });
});

describe("renderComment footer", () => {
  it("carries the unchanged count and the artifact name in a <sub> line", () => {
    const body = render();
    const footer = body.split("\n").find((l) => l.startsWith("<sub>"));
    expect(footer).toContain(String(49 - FIXTURE_CHANGED.length));
    expect(footer).toContain("rialto-web-visual-diffs");
  });
});

// ---------------------------------------------------------------------------
// The unchanged count is the REAL pass count, never `total - changed.length`.
// ---------------------------------------------------------------------------

describe("renderComment and specs that failed without a snapshot diff", () => {
  // The reproduction from review: three specs — one a 579 px diff, one dying on
  // net::ERR_CONNECTION_REFUSED, one on a 30 s timeout. Neither hard failure
  // yields an -actual attachment, so neither appears in `changed`; deriving the
  // unchanged count by subtraction then rendered "2 of 3 snapshots unchanged",
  // telling the reader — and the autonomous review layer this comment is written
  // for — that two specs which never reached a comparison were fine.
  const body = renderComment({
    total: 3,
    changed: [record("light-button-variants", 579)],
    unchanged: 0,
    failedWithoutDiff: 2,
    budget: 300,
    sha: SHA,
    repoSlug: SLUG,
    runId: "1",
    runAttempt: "1",
  });

  it("does not describe a hard-failing spec as unchanged", () => {
    expect(body).not.toContain("2 of 3 snapshots unchanged");
    expect(body).toContain("0 of 3 snapshots unchanged");
  });

  it("says in the footer that the remaining specs failed without a snapshot diff", () => {
    const footer = body.split("\n").find((l) => l.startsWith("<sub>"));
    expect(footer).toMatch(/2 spec/);
    expect(footer.toLowerCase()).toContain("without");
  });

  it("stays silent about the third bucket when it is empty", () => {
    const footer = render()
      .split("\n")
      .find((l) => l.startsWith("<sub>"));
    expect(footer).not.toMatch(/without a snapshot diff/);
  });
});

// SC-2, asserted directly: the comment TEXT alone must carry the counts and
// every changed snapshot's name and pixel difference against the budget. No
// image is fetched anywhere in this test.
describe("renderComment satisfies SC-2 from text alone", () => {
  const body = render();

  it("carries the changed-of-total count", () => {
    expect(body).toMatch(new RegExp(`${FIXTURE_CHANGED.length} of 49 changed`));
  });

  it("carries every changed snapshot's name and its difference against the budget", () => {
    for (const rec of FIXTURE_CHANGED) {
      expect(body).toContain(rec.name);
      expect(body).toContain(rec.pixels === null ? rec.reason : `${rec.pixels} px over 300 budget`);
    }
  });
});

describe("renderComment degrades when the budget could not be read", () => {
  const body = render({ budget: null });

  it("drops the budget clause from every heading", () => {
    expect(body).toContain("### light-alpha (5606 px changed)");
    expect(body).not.toContain("budget)");
  });

  it("drops the budget clause from every overflow line", () => {
    expect(body).toContain("579 px changed");
    expect(body).not.toContain("over 300");
  });

  it("says in the footer that the budget could not be read", () => {
    const footer = body.split("\n").find((l) => l.startsWith("<sub>"));
    expect(footer.toLowerCase()).toContain("budget could not be read");
  });

  it("substitutes no default anywhere", () => {
    expect(body).not.toContain("300");
  });
});

describe("renderComment holds no budget of its own", () => {
  it("contains the literal 300 nowhere in its source", () => {
    // A comment that confidently asserts a budget it did not read would
    // reproduce #4496 — the tolerance change nobody noticed — inside the fix
    // for it. The number arrives from the caller or not at all.
    const source = readFileSync(resolve(__dirname, "../visual-diff-comment.mjs"), "utf8");
    expect(source).not.toContain("300");
  });
});

// ---------------------------------------------------------------------------
// 2.3 — decideCommentAction: the single staleness guard over EVERY write to
// the one shared cell, deletion included.
//
// The 8 cases below are read straight from architecture.md § decideCommentAction:
//
//   | standing comment                   | visual failed | visual passed |
//   | ---------------------------------- | ------------- | ------------- |
//   | absent                             | post          | skip          |
//   | ordinal <= ours                     | patch         | delete        |
//   | ordinal strictly newer             | skip          | skip          |
//   | marker present, ordinal unparsable | patch         | skip          |
// ---------------------------------------------------------------------------

const OURS = { runId: "500", runAttempt: "2" };

/** A standing comment body carrying the given ordinal. */
function standing(runId, runAttempt) {
  return `${COMMENT_MARKER_PREFIX}${runId} attempt=${runAttempt} -->\n## 🖼 Visual regression — 1 of 49 changed\n`;
}

describe("decideCommentAction — absent standing comment", () => {
  it("posts when the visual job failed", () => {
    expect(decideCommentAction({ existingBody: null, runOrdinal: OURS, visualFailed: true })).toBe(
      "post"
    );
  });

  it("SKIPS when the visual job passed — there is nothing to clear, so this is not a post", () => {
    // Easily inverted: "passed" is the delete branch, but with no standing
    // comment there is nothing to delete and nothing to say.
    expect(decideCommentAction({ existingBody: null, runOrdinal: OURS, visualFailed: false })).toBe(
      "skip"
    );
  });

  it("treats undefined the same as null", () => {
    expect(
      decideCommentAction({ existingBody: undefined, runOrdinal: OURS, visualFailed: true })
    ).toBe("post");
  });
});

describe("decideCommentAction — standing ordinal at or below ours", () => {
  it("patches when the visual job failed", () => {
    expect(
      decideCommentAction({
        existingBody: standing("400", "1"),
        runOrdinal: OURS,
        visualFailed: true,
      })
    ).toBe("patch");
  });

  it("deletes when the visual job passed", () => {
    expect(
      decideCommentAction({
        existingBody: standing("400", "1"),
        runOrdinal: OURS,
        visualFailed: false,
      })
    ).toBe("delete");
  });
});

describe("decideCommentAction — standing ordinal strictly newer", () => {
  it("skips when the visual job failed", () => {
    expect(
      decideCommentAction({
        existingBody: standing("600", "1"),
        runOrdinal: OURS,
        visualFailed: true,
      })
    ).toBe("skip");
  });

  it("skips when the visual job passed — the delete direction, and the gap that routed back", () => {
    // An older PASSING run must not remove a newer FAILING run's comment: that
    // leaves a live visual failure on the PR with no comment at all — the exact
    // state SC-1 and SC-5 exist to prevent, arriving from the other side.
    expect(
      decideCommentAction({
        existingBody: standing("600", "1"),
        runOrdinal: OURS,
        visualFailed: false,
      })
    ).toBe("skip");
  });
});

describe("decideCommentAction — marker present, ordinal unparsable", () => {
  const garbled = "<!-- visual-diffs-in-pr run= attempt= -->\nsomething went wrong\n";

  it("PATCHES when the visual job failed", () => {
    // The one deliberate asymmetry. A wrong patch leaves visible stale content
    // that the next run of either outcome repairs.
    expect(
      decideCommentAction({ existingBody: garbled, runOrdinal: OURS, visualFailed: true })
    ).toBe("patch");
  });

  it("SKIPS when the visual job passed", () => {
    // A wrong delete leaves a live failure with no comment and nothing
    // announces it. Resolve toward the recoverable wrong answer.
    expect(
      decideCommentAction({ existingBody: garbled, runOrdinal: OURS, visualFailed: false })
    ).toBe("skip");
  });

  it("treats a body with no marker at all the same way", () => {
    expect(
      decideCommentAction({ existingBody: "just a comment", runOrdinal: OURS, visualFailed: true })
    ).toBe("patch");
    expect(
      decideCommentAction({ existingBody: "just a comment", runOrdinal: OURS, visualFailed: false })
    ).toBe("skip");
  });
});

describe("decideCommentAction ordinal rule", () => {
  it("acts on an EQUAL ordinal — >= not >", () => {
    // A `>` implementation would stop a re-executed publisher step from
    // correcting its own comment, and only this case catches it.
    expect(
      decideCommentAction({
        existingBody: standing("500", "2"),
        runOrdinal: OURS,
        visualFailed: true,
      })
    ).toBe("patch");
    expect(
      decideCommentAction({
        existingBody: standing("500", "2"),
        runOrdinal: OURS,
        visualFailed: false,
      })
    ).toBe("delete");
  });

  it("compares run id first, then attempt", () => {
    expect(
      decideCommentAction({
        existingBody: standing("500", "1"),
        runOrdinal: OURS,
        visualFailed: true,
      })
    ).toBe("patch");
    expect(
      decideCommentAction({
        existingBody: standing("500", "3"),
        runOrdinal: OURS,
        visualFailed: true,
      })
    ).toBe("skip");
  });

  it("compares run ids numerically, not as raw strings", () => {
    // Run ids are numeric and of different lengths; a plain string compare
    // makes "9000000000" older than "32873184619".
    const ours = { runId: "32873184619", runAttempt: "1" };
    expect(
      decideCommentAction({
        existingBody: standing("9000000000", "1"),
        runOrdinal: ours,
        visualFailed: true,
      })
    ).toBe("patch");
  });

  it("never throws on a malformed ordinal of our own", () => {
    expect(
      decideCommentAction({
        existingBody: standing("400", "1"),
        runOrdinal: {},
        visualFailed: true,
      })
    ).toBe("patch");
    expect(decideCommentAction({ existingBody: standing("400", "1"), visualFailed: false })).toBe(
      "skip"
    );
  });
});

describe("decideCommentAction concurrency, documented", () => {
  it("lets an older run finishing last decline to overwrite a newer run's comment", () => {
    // rialto-web-e2e.yml declares no `concurrency:` group, so two runs for one
    // PR can overlap and the older can finish last. Refs are immune by
    // construction (each run writes its own); the comment is the one shared
    // cell, so the guard lives exactly there — and covers every write to it.
    const newerStanding = standing("601", "1");
    const olderRun = { runId: "600", runAttempt: "1" };
    expect(
      decideCommentAction({
        existingBody: newerStanding,
        runOrdinal: olderRun,
        visualFailed: true,
      })
    ).toBe("skip");
    expect(
      decideCommentAction({
        existingBody: newerStanding,
        runOrdinal: olderRun,
        visualFailed: false,
      })
    ).toBe("skip");
  });

  it("returns a verb, never a boolean", () => {
    const verbs = new Set(["post", "patch", "delete", "skip"]);
    for (const visualFailed of [true, false]) {
      for (const body of [null, standing("400", "1"), standing("600", "1"), "garbled"]) {
        const verb = decideCommentAction({ existingBody: body, runOrdinal: OURS, visualFailed });
        expect(verbs.has(verb)).toBe(true);
      }
    }
  });
});

describe("parseCommentOrdinal", () => {
  it("reads the ordinal a standing comment records", () => {
    expect(parseCommentOrdinal(standing("600", "3"))).toEqual({ runId: 600, runAttempt: 3 });
  });

  it("returns null for a body with no marker, a garbled marker, or no body", () => {
    expect(parseCommentOrdinal("just a comment")).toBeNull();
    expect(parseCommentOrdinal("<!-- visual-diffs-in-pr run= attempt= -->")).toBeNull();
    expect(parseCommentOrdinal(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The comment's image set is BOUND to the blob set the publisher pushed.
//
// Both used to be derived independently — `renderComment` re-ran
// `selectDisplayed` with its own default cap while the publisher ran it with
// `MAX_IMAGE_ROWS` and then dropped any blob missing from the downloaded
// artifact. Every way those two derivations could disagree (a different cap on
// either side, a dropped existence guard) produced a comment whose `<img>` tags
// point at blobs that were never published: a wall of broken images, and no
// test noticed.
// ---------------------------------------------------------------------------

describe("renderComment binds its images to the published blob set", () => {
  it("renders exactly the records the caller published for, not a cap of its own", () => {
    const displayed = selectDisplayed(FIXTURE_CHANGED, 2);
    const body = render({ displayed });
    expect(body.match(/^### .*$/gm) ?? []).toHaveLength(2);
    // The text stays exhaustive: the other seven are still named.
    for (const rec of FIXTURE_CHANGED) expect(body).toContain(rec.name);
  });

  it("lists every changed snapshot the caller did not publish an image for", () => {
    const body = render({ displayed: selectDisplayed(FIXTURE_CHANGED, 2) });
    expect(body).toContain(`**${FIXTURE_CHANGED.length - 2} more changed snapshots**`);
  });

  it("renders no <img> for a blob that never made it into the published set", () => {
    const displayed = selectDisplayed(FIXTURE_CHANGED, 2);
    const published = blobsFor(displayed).filter((n) => !n.endsWith("-diff.png"));
    const body = render({ displayed, publishedBlobs: published });
    expect(body).not.toContain("-diff.png");
    expect(body).toContain("light-alpha-actual.png");
  });

  it("never addresses a blob outside the published set, for any cap", () => {
    for (const cap of [1, 2, 3, 6, 9]) {
      const displayed = selectDisplayed(FIXTURE_CHANGED, cap);
      const published = new Set(blobsFor(displayed));
      const body = render({ displayed, publishedBlobs: [...published] });
      const addressed = [...body.matchAll(/src="[^"]*\/([^/"]+\.png)"/g)].map((m) => m[1]);
      expect(addressed.length).toBeGreaterThan(0);
      for (const name of addressed) expect(published.has(name)).toBe(true);
    }
  });
});

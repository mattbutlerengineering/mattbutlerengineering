import { describe, it, expect } from "vitest";
import {
  parseTaskList,
  extractProposalIssue,
  slugFor,
  liveUrlFor,
  deriveShippedFeatures,
  extractReviewVerdict,
  collectShippedInput,
  runCli,
} from "../collect-shipped-features.mjs";

describe("parseTaskList", () => {
  it("reads checked and unchecked task lines in order, em dash or hyphen", () => {
    const body = ["- [ ] #12 — first", "- [x] #7 - second", "* [X] #30 third"].join("\n");
    expect(parseTaskList(body)).toEqual([12, 7, 30]);
  });
  it("de-duplicates and ignores #N mentions outside task-list lines", () => {
    const body = "See #99 and #98.\n- [x] #5 — a\n- [ ] #5 — again\nnot a task #6";
    expect(parseTaskList(body)).toEqual([5]);
  });
  it("returns [] for non-strings and bodies without a task list", () => {
    expect(parseTaskList(null)).toEqual([]);
    expect(parseTaskList("just prose #4")).toEqual([]);
  });
});

describe("extractProposalIssue", () => {
  it("finds the proposal reference", () => {
    expect(extractProposalIssue("Tracking for feature (proposal #6896).")).toBe(6896);
    expect(extractProposalIssue("Proposal issue #12")).toBe(12);
  });
  it("returns null when absent or non-string", () => {
    expect(extractProposalIssue("- [ ] #5 — a")).toBeNull();
    expect(extractProposalIssue(undefined)).toBeNull();
  });
});

describe("slugFor", () => {
  it("strips the Feature prefix and tracking suffix and appends the issue number", () => {
    expect(slugFor({ number: 4602, title: "[Feature] Waitlist Estimates: tracking issue" })).toBe(
      "waitlist-estimates-4602"
    );
  });
  it("is stable for unusual titles", () => {
    expect(slugFor({ number: 9, title: "  [Feature]  A/B -- test!!  " })).toBe("a-b-test-9");
    expect(slugFor({ number: 9, title: "" })).toBe("9");
  });
});

describe("liveUrlFor", () => {
  it("maps the surface with the most files", () => {
    expect(
      liveUrlFor(["apps/hospitality/a.ts", "apps/hospitality/b.ts", "packages/rialto/x.tsx"])
    ).toBe("/hospitality/");
    expect(liveUrlFor(["apps/rialto-web/a.tsx", "packages/rialto/b.tsx"])).toBe("/rialto/");
    expect(liveUrlFor(["apps/marketing/a.tsx"])).toBe("/");
  });
  it("returns null for docs-only or scripts-only changes", () => {
    expect(liveUrlFor(["docs/a.md", "scripts/b.mjs"])).toBeNull();
    expect(liveUrlFor([])).toBeNull();
    expect(liveUrlFor(null)).toBeNull();
  });
});

const tracking = (over = {}) => ({
  number: 100,
  title: "[Feature] Alpha: tracking issue",
  body: "Tracking (proposal #90)\n- [x] #101 — one\n- [x] #102 — two\n",
  created_at: "2026-10-02T00:00:00Z",
  ...over,
});
const pr = (over = {}) => ({
  number: 201,
  title: "feat: one",
  merged_at: "2026-10-05T12:00:00Z",
  merge_commit_sha: "abc",
  files: ["apps/hospitality/a.ts"],
  reviewVerdict: "pass",
  ciGate: "success",
  ...over,
});
const input = (over = {}) => ({
  trackingIssues: [tracking()],
  childIssuesByNumber: {
    101: { number: 101, title: "one" },
    102: { number: 102, title: "two" },
  },
  prsByIssue: {
    101: [pr()],
    102: [pr({ number: 202, merged_at: "2026-10-06T00:00:00Z", merge_commit_sha: "def" })],
  },
  proposalsByNumber: {
    90: {
      number: 90,
      title: "proposal",
      created_at: "2026-10-01T00:00:00Z",
      body: "Why now.\n\nmore",
    },
  },
  generatedAt: "2026-10-16T00:00:00Z",
  ...over,
});

describe("deriveShippedFeatures", () => {
  it("builds a feature with children in task order and computed fields", () => {
    const { snapshot, skipped } = deriveShippedFeatures(input());
    expect(skipped).toEqual({ noTaskList: 0, noMergedPrs: 0 });
    expect(snapshot.generatedAt).toBe("2026-10-16T00:00:00.000Z");
    const [f] = snapshot.features;
    expect(f).toMatchObject({
      slug: "alpha-100",
      title: "Alpha",
      trackingIssue: 100,
      proposalIssue: 90,
      proposalEvidence: "Why now.",
      proposedAt: "2026-10-01T00:00:00.000Z",
      firstMergedAt: "2026-10-05T12:00:00.000Z",
      lastMergedAt: "2026-10-06T00:00:00.000Z",
      wallClockHours: 120,
      liveUrl: "/hospitality/",
    });
    expect(f.children.map((c) => c.issue)).toEqual([101, 102]);
    expect(f.children[0].prs[0]).toEqual({
      number: 201,
      title: "feat: one",
      mergedAt: "2026-10-05T12:00:00.000Z",
      mergeCommit: "abc",
      reviewVerdict: "pass",
      ciGate: "success",
    });
  });

  it("falls back to the tracking created_at when there is no proposal", () => {
    const { snapshot } = deriveShippedFeatures(
      input({ trackingIssues: [tracking({ body: "- [x] #101 — one\n" })] })
    );
    const [f] = snapshot.features;
    expect(f.proposalIssue).toBeNull();
    expect(f.proposedAt).toBeNull();
    expect(f.proposalEvidence).toBeNull();
    expect(f.wallClockHours).toBe(84);
  });

  it("skips a tracking issue with no task list", () => {
    const { snapshot, skipped } = deriveShippedFeatures(
      input({ trackingIssues: [tracking({ body: "no list" })] })
    );
    expect(snapshot.features).toEqual([]);
    expect(skipped).toEqual({ noTaskList: 1, noMergedPrs: 0 });
  });

  it("skips a tracking issue whose children have no merged PRs", () => {
    const { snapshot, skipped } = deriveShippedFeatures(
      input({ prsByIssue: { 101: [pr({ merged_at: null })], 102: [] } })
    );
    expect(snapshot.features).toEqual([]);
    expect(skipped).toEqual({ noTaskList: 0, noMergedPrs: 1 });
  });

  it("ignores malformed entries instead of throwing", () => {
    const { snapshot } = deriveShippedFeatures(
      input({
        trackingIssues: [null, 5, tracking()],
        prsByIssue: { 101: [pr(), null, { number: "x" }], 102: "nope" },
      })
    );
    expect(snapshot.features).toHaveLength(1);
    expect(snapshot.features[0].children.map((c) => c.issue)).toEqual([101]);
    expect(() => deriveShippedFeatures(undefined)).not.toThrow();
    expect(deriveShippedFeatures(undefined).snapshot.features).toEqual([]);
  });

  it("orders features newest-first, then trackingIssue desc; PRs by mergedAt asc", () => {
    const t2 = tracking({
      number: 200,
      title: "[Feature] Beta: tracking issue",
      body: "- [x] #301 — b",
    });
    const t3 = tracking({
      number: 300,
      title: "[Feature] Gamma: tracking issue",
      body: "- [x] #301 — b",
    });
    const prs = {
      101: [
        pr({ number: 2, merged_at: "2026-10-07T00:00:00Z" }),
        pr({ number: 1, merged_at: "2026-10-03T00:00:00Z" }),
      ],
      102: [],
      301: [pr({ number: 3, merged_at: "2026-10-09T00:00:00Z" })],
    };
    const { snapshot } = deriveShippedFeatures(
      input({
        trackingIssues: [t2, tracking(), t3],
        childIssuesByNumber: { 101: { number: 101, title: "a" }, 301: { number: 301, title: "b" } },
        prsByIssue: prs,
      })
    );
    expect(snapshot.features.map((f) => f.trackingIssue)).toEqual([300, 200, 100]);
    expect(snapshot.features[2].children[0].prs.map((p) => p.number)).toEqual([1, 2]);
  });

  it("is byte-identical across shuffled input arrays", () => {
    const a = tracking({ number: 1, body: "- [x] #101 — x" });
    const b = tracking({ number: 2, body: "- [x] #101 — x" });
    const c = tracking({ number: 3, body: "- [x] #101 — x" });
    const prs = { 101: [pr({ number: 1 }), pr({ number: 2, merged_at: "2026-10-05T12:00:00Z" })] };
    const run = (ts, ps) =>
      JSON.stringify(
        deriveShippedFeatures(
          input({
            trackingIssues: ts,
            prsByIssue: { 101: ps },
            childIssuesByNumber: { 101: { number: 101, title: "x" } },
          })
        )
      );
    expect(run([a, b, c], prs[101])).toBe(run([c, a, b], [...prs[101]].reverse()));
  });

  it("produces a liveUrl that is site-relative or null", () => {
    const { snapshot } = deriveShippedFeatures(
      input({ prsByIssue: { 101: [pr({ files: ["docs/x.md"] })], 102: [] } })
    );
    expect(snapshot.features[0].liveUrl).toBeNull();
  });

  it("emits the shape the marketing guard requires (apps cannot be imported from scripts)", () => {
    const { snapshot } = deriveShippedFeatures(input());
    const isIso = (v) => typeof v === "string" && new Date(v).toISOString() === v;
    expect(isIso(snapshot.generatedAt)).toBe(true);
    for (const f of snapshot.features) {
      expect(Number.isInteger(f.trackingIssue)).toBe(true);
      expect(f.liveUrl === null || /^\/(?!\/)/.test(f.liveUrl)).toBe(true);
      expect([f.firstMergedAt, f.lastMergedAt].every(isIso)).toBe(true);
      expect(f.proposedAt === null || isIso(f.proposedAt)).toBe(true);
      for (const c of f.children) {
        expect(Number.isInteger(c.issue)).toBe(true);
        for (const p of c.prs) {
          expect(Number.isInteger(p.number)).toBe(true);
          expect(isIso(p.mergedAt)).toBe(true);
          expect(Object.keys(p).sort()).toEqual([
            "ciGate",
            "mergeCommit",
            "mergedAt",
            "number",
            "reviewVerdict",
            "title",
          ]);
        }
      }
    }
  });
});

// ---- gh I/O layer (injected runner, no network) ----------------------------

const TRACKING = {
  number: 100,
  title: "[Feature] Demo: tracking issue",
  body: "Tracking (proposal #90).\n\n- [x] #101 — a\n- [x] #102 — b",
  created_at: "2026-10-01T00:00:00Z",
};

function fakeGh(overrides = {}, calls = []) {
  const routes = {
    "issues?labels=tracking": [[TRACKING, { number: 7, pull_request: {}, title: "pr" }]],
    "issues/90": { number: 90, created_at: "2026-09-30T00:00:00Z", body: "Why.\n\nMore." },
    "issues/101/timeline": [
      [
        { event: "cross-referenced", source: { issue: { number: 201, pull_request: {} } } },
        { event: "labeled" },
      ],
    ],
    "issues/102/timeline": [
      [
        { event: "cross-referenced", source: { issue: { number: 202, pull_request: {} } } },
        { event: "cross-referenced", source: { issue: { number: 203, pull_request: {} } } },
      ],
    ],
    "issues/101": { number: 101, title: "a" },
    "issues/102": { number: 102, title: "b" },
    "pulls/201/files": [[{ filename: "apps/hospitality/a.tsx" }]],
    "pulls/202/files": [[{ filename: "apps/hospitality/b.tsx" }]],
    "pulls/201": {
      number: 201,
      title: "pr a",
      body: "Closes #101",
      merged_at: "2026-10-02T00:00:00Z",
      merge_commit_sha: "aaa",
      head: { sha: "h1" },
    },
    "pulls/202": {
      number: 202,
      title: "pr b",
      body: "Closes #102",
      merged_at: "2026-10-03T00:00:00Z",
      merge_commit_sha: "bbb",
      head: { sha: "h2" },
    },
    "pulls/203": {
      number: 203,
      title: "mentions only",
      body: "see #102",
      merged_at: "2026-10-04T00:00:00Z",
      merge_commit_sha: "ccc",
      head: { sha: "h3" },
    },
    "commits/h1/check-runs": { check_runs: [{ conclusion: "success" }] },
    "commits/h2/check-runs": { check_runs: [] },
    "commits/h2/statuses": [{ context: "CI Gate", state: "failure" }],
    "issues/201/comments": [[{ body: "Reviewer verdict: PASS (8/10)" }]],
    "issues/202/comments": [[]],
    ...overrides,
  };
  return (args) => {
    calls.push(args);
    const path = args.find((a) => a.startsWith("repos/")) ?? "";
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => path.includes(k));
    if (!key) throw new Error(`unrouted ${path}`);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return JSON.stringify(value);
  };
}

describe("extractReviewVerdict", () => {
  it("reads pass/flag from a verdict comment, null otherwise", () => {
    expect(extractReviewVerdict([{ body: "Reviewer verdict: FLAG (4/10)" }])).toBe("flag");
    expect(extractReviewVerdict([{ body: "nice" }, { body: "review verdict - pass" }])).toBe(
      "pass"
    );
    expect(extractReviewVerdict([{ body: "looks good" }])).toBeNull();
    expect(extractReviewVerdict(null)).toBeNull();
  });
});

describe("collectShippedInput", () => {
  it("gathers merged closing PRs per child over REST only", () => {
    const calls = [];
    const input = collectShippedInput({ gh: fakeGh({}, calls), repo: "o/r" });
    expect(input.trackingIssues.map((t) => t.number)).toEqual([100]);
    expect(Object.keys(input.prsByIssue).sort()).toEqual(["101", "102"]);
    expect(input.prsByIssue[102].map((p) => p.number)).toEqual([202]);
    expect(input.prsByIssue[101][0]).toMatchObject({
      files: ["apps/hospitality/a.tsx"],
      ciGate: "success",
      reviewVerdict: "pass",
    });
    expect(input.prsByIssue[102][0]).toMatchObject({ ciGate: "failure", reviewVerdict: null });
    expect(input.proposalsByNumber[90].created_at).toBe("2026-09-30T00:00:00Z");
    for (const args of calls) expect(args[0]).toBe("api");
  });

  it("honours limit by most recent tracking issue", () => {
    const gh = fakeGh({
      "issues?labels=tracking": [[TRACKING, { ...TRACKING, number: 50 }]],
    });
    expect(
      collectShippedInput({ gh, repo: "o/r", limit: 1 }).trackingIssues.map((t) => t.number)
    ).toEqual([100]);
  });
});

describe("runCli", () => {
  function harness(gh, argv = []) {
    const writes = [];
    const out = [];
    const err = [];
    const code = runCli(argv, {
      gh,
      repo: "o/r",
      writeFile: (path, data) => writes.push({ path, data }),
      log: (m) => out.push(m),
      errorLog: (m) => err.push(m),
    });
    return { code, writes, out, err };
  }

  it("writes a prettier-stable snapshot and prints a summary", () => {
    const { code, writes, out } = harness(fakeGh());
    expect(code).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toMatch(/apps\/marketing\/src\/data\/shipped-features\.json$/);
    expect(writes[0].data.endsWith("}\n")).toBe(true);
    expect(JSON.parse(writes[0].data).features).toHaveLength(1);
    expect(out.join("\n")).toMatch(/wrote 1 features, skipped 0/);
  });

  it("is byte-identical across runs with unchanged upstream data", () => {
    const a = harness(fakeGh()).writes[0].data;
    const b = harness(fakeGh()).writes[0].data;
    expect(a).toBe(b);
    expect(JSON.parse(a).generatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("honours --out", () => {
    expect(harness(fakeGh(), ["--out", "/tmp/x.json"]).writes[0].path).toBe("/tmp/x.json");
  });

  it("--dry-run prints the snapshot and writes nothing", () => {
    const { code, writes, out } = harness(fakeGh(), ["--dry-run"]);
    expect(code).toBe(0);
    expect(writes).toEqual([]);
    expect(out.join("\n")).toContain('"features"');
  });

  it("fails non-zero and does NOT write when a fetch fails", () => {
    const gh = fakeGh({ "pulls/201": new Error("HTTP 401: Bad credentials") });
    const { code, writes, err } = harness(gh);
    expect(code).not.toBe(0);
    expect(writes).toEqual([]);
    expect(err.join("\n")).toMatch(/Bad credentials/);
  });

  it("fails rather than overwriting with an empty snapshot when no tracking issues come back", () => {
    const { code, writes } = harness(fakeGh({ "issues?labels=tracking": [[]] }));
    expect(code).not.toBe(0);
    expect(writes).toEqual([]);
  });
});

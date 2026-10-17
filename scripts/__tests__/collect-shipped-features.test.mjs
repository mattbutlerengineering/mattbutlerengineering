import { describe, it, expect } from "vitest";
import {
  parseTaskList,
  extractProposalIssue,
  slugFor,
  liveUrlFor,
  deriveShippedFeatures,
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

describe("runCli (injected gh runner)", () => {
  const tracking = {
    number: 100,
    title: "[Feature] Demo: tracking issue",
    body: "Proposal #90.\n- [x] #101 — child",
    created_at: "2026-10-01T00:00:00Z",
  };
  const routes = {
    "repos/{owner}/{repo}/issues?labels=tracking&state=closed&per_page=100": [[tracking]],
    "repos/{owner}/{repo}/issues/101": { number: 101, title: "child" },
    "repos/{owner}/{repo}/issues/90": {
      number: 90,
      created_at: "2026-09-30T00:00:00Z",
      body: "Why.",
    },
    "repos/{owner}/{repo}/issues/101/timeline": [
      [
        {
          event: "cross-referenced",
          source: { issue: { number: 200, pull_request: {}, body: "Closes #101" } },
        },
        {
          event: "cross-referenced",
          source: { issue: { number: 201, pull_request: {}, body: "Refs #101" } },
        },
      ],
    ],
    "repos/{owner}/{repo}/pulls/200": {
      number: 200,
      title: "feat: child",
      merged_at: "2026-10-02T00:00:00Z",
      merge_commit_sha: "abc",
      head: { sha: "def" },
    },
    "repos/{owner}/{repo}/pulls/200/files": [[{ filename: "apps/marketing/x.ts" }]],
    "repos/{owner}/{repo}/commits/def/check-runs?check_name=CI%20Gate": {
      check_runs: [{ conclusion: "success" }],
    },
    "repos/{owner}/{repo}/issues/200/comments": [[{ body: "Review\nVerdict: PASS 9/10" }]],
  };
  const okGh = (args) => {
    const path = args.at(-1);
    if (!(path in routes)) throw new Error(`unexpected ${path}`);
    expect(args[0]).toBe("api");
    return JSON.stringify(routes[path]);
  };

  it("writes a deterministic snapshot and uses only gh api", () => {
    const writes = [];
    const run = () =>
      runCli(["--out", "/tmp/x.json"], {
        gh: okGh,
        write: (p, c) => writes.push([p, c]),
        log: () => {},
        err: () => {},
      });
    expect(run()).toBe(0);
    expect(run()).toBe(0);
    expect(writes[0][1]).toBe(writes[1][1]);
    const snap = JSON.parse(writes[0][1]);
    expect(snap.features).toHaveLength(1);
    expect(snap.generatedAt).toBe("2026-10-02T00:00:00.000Z");
    const pr = snap.features[0].children[0].prs[0];
    expect(pr).toMatchObject({ number: 200, ciGate: "success", reviewVerdict: "pass" });
    expect(writes[0][1].endsWith("}\n")).toBe(true);
  });

  it("exits non-zero and writes nothing when a fetch fails", () => {
    const writes = [];
    const errs = [];
    const code = runCli([], {
      gh: () => {
        throw new Error("HTTP 401");
      },
      write: (...a) => writes.push(a),
      log: () => {},
      err: (m) => errs.push(m),
    });
    expect(code).toBe(1);
    expect(writes).toEqual([]);
    expect(errs[0]).toMatch(/HTTP 401/);
  });

  it("--dry-run prints and writes nothing", () => {
    const writes = [];
    const logs = [];
    const code = runCli(["--dry-run", "--limit", "1"], {
      gh: okGh,
      write: (...a) => writes.push(a),
      log: (m) => logs.push(m),
      err: () => {},
    });
    expect(code).toBe(0);
    expect(writes).toEqual([]);
    expect(logs.at(-1)).toBe("wrote 1 features, skipped 0 (dry run)");
  });

  it("rejects unknown flags", () => {
    expect(runCli(["--bogus"], { gh: okGh, err: () => {} })).toBe(1);
  });
});

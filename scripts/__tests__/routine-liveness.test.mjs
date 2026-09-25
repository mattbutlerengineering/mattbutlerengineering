import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COORDINATION_LABELS } from "@mbe/gh-client";
import {
  classifyRoutineLiveness,
  matchesSignature,
  buildRoutineFindingTitle,
  extractRoutineNameFromIssueTitle,
  findPriorRoutineFindingIssue,
  buildRoutineFindingBody,
  buildRoutineFindingCreateArgs,
  runRoutineLivenessCheck,
  isObservationBlackout,
} from "../routine-liveness.mjs";
import { ROUTINE_MANIFEST, parseRoutineCatalog } from "../routine-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const PR_TITLE_SIGNATURE = {
  type: "pr-title",
  pattern: String.raw`weekly improve \d{4}-\d{2}-\d{2}`,
  searchTerm: "weekly improve",
};

const ISSUE_LABEL_SIGNATURE = { type: "issue-label", label: "audit" };

describe("matchesSignature", () => {
  it("matches a pr-title signature against a PR artifact's title", () => {
    const artifact = { type: "pr", title: "fix(routines): weekly improve 2026-09-19 — foo" };
    expect(matchesSignature(artifact, PR_TITLE_SIGNATURE)).toBe(true);
  });

  it("does not match a pr-title signature against an unrelated title", () => {
    const artifact = { type: "pr", title: "fix(routines): give it a detectable PR signature" };
    expect(matchesSignature(artifact, PR_TITLE_SIGNATURE)).toBe(false);
  });

  it("does not match a pr-title signature against a non-pr artifact", () => {
    const artifact = { type: "issue", title: "weekly improve 2026-09-19" };
    expect(matchesSignature(artifact, PR_TITLE_SIGNATURE)).toBe(false);
  });

  it("matches an issue-label signature against an issue artifact carrying the label", () => {
    const artifact = { type: "issue", labels: ["ready", "audit"] };
    expect(matchesSignature(artifact, ISSUE_LABEL_SIGNATURE)).toBe(true);
  });

  it("does not match an issue-label signature when the label is absent", () => {
    const artifact = { type: "issue", labels: ["ready"] };
    expect(matchesSignature(artifact, ISSUE_LABEL_SIGNATURE)).toBe(false);
  });
});

describe("classifyRoutineLiveness", () => {
  const now = "2026-09-20T00:00:00Z";

  it("reports unverifiable when no signature is declared — fails closed, never silently passes", () => {
    expect(
      classifyRoutineLiveness({ signature: undefined, periodDays: 7, observedArtifacts: [], now })
    ).toEqual({ status: "unverifiable", matched: null });
  });

  it("reports alive when a matching artifact was observed within the period", () => {
    const observedArtifacts = [
      {
        type: "pr",
        title: "fix(routines): weekly improve 2026-09-19 — foo",
        observedAt: "2026-09-19T00:00:00Z",
      },
    ];
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts,
      now,
    });
    expect(result.status).toBe("alive");
    expect(result.matched.title).toContain("weekly improve 2026-09-19");
  });

  it("reports late when the most recent match is older than the period but within 2x", () => {
    const observedArtifacts = [
      {
        type: "pr",
        title: "fix(routines): weekly improve 2026-09-10 — foo",
        observedAt: "2026-09-10T00:00:00Z", // 10 days before `now` — 1x < age <= 2x periods (7d)
      },
    ];
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts,
      now,
    });
    expect(result.status).toBe("late");
  });

  it("reports dark when no matching artifact exists at all", () => {
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts: [],
      now,
    });
    expect(result).toEqual({ status: "dark", matched: null });
  });

  it("reports dark when the most recent match is older than 2x the period", () => {
    const observedArtifacts = [
      {
        type: "pr",
        title: "fix(routines): weekly improve 2026-08-01 — foo",
        observedAt: "2026-08-01T00:00:00Z",
      },
    ];
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts,
      now,
    });
    expect(result.status).toBe("dark");
  });

  it("does not match #5373 itself — the fix PR describing the convention, not a genuine run", () => {
    // Real title of the PR that introduced the title convention (#5344/#5373).
    // A self-referential mention of "weekly improve" inside a routine's own
    // meta-fix PR must never count as that routine's artifact.
    const observedArtifacts = [
      {
        type: "pr",
        title: "fix(routines): give mbe-weekly-improve a detectable PR signature (#5373)",
        observedAt: "2026-09-15T00:41:00Z",
      },
    ];
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts,
      now,
    });
    expect(result.status).toBe("dark");
  });

  it("ignores observed artifacts from the future (negative age)", () => {
    const observedArtifacts = [
      {
        type: "pr",
        title: "fix(routines): weekly improve 2026-09-25 — foo",
        observedAt: "2026-09-25T00:00:00Z",
      },
    ];
    const result = classifyRoutineLiveness({
      signature: PR_TITLE_SIGNATURE,
      periodDays: 7,
      observedArtifacts,
      now,
    });
    expect(result.status).toBe("dark");
  });

  it("throws on an invalid `now`", () => {
    expect(() =>
      classifyRoutineLiveness({
        signature: PR_TITLE_SIGNATURE,
        periodDays: 7,
        observedArtifacts: [],
        now: "not-a-date",
      })
    ).toThrow();
  });
});

describe("buildRoutineFindingTitle / extractRoutineNameFromIssueTitle", () => {
  it("round-trips a dark finding's routine name through its title", () => {
    const title = buildRoutineFindingTitle("mbe-weekly-improve", "dark");
    expect(extractRoutineNameFromIssueTitle({ title })).toBe("mbe-weekly-improve");
  });

  it("round-trips an unverifiable finding's routine name through its title", () => {
    const title = buildRoutineFindingTitle("mbe-daily-issue", "unverifiable");
    expect(extractRoutineNameFromIssueTitle({ title })).toBe("mbe-daily-issue");
  });

  it("returns null for a title that isn't a routine-liveness finding", () => {
    expect(extractRoutineNameFromIssueTitle({ title: "ci-fix: something unrelated" })).toBe(null);
  });
});

describe("findPriorRoutineFindingIssue", () => {
  it("finds the issue number for a matching routine name", () => {
    const candidates = [
      { number: 10, title: buildRoutineFindingTitle("mbe-daily-issue", "unverifiable") },
      { number: 11, title: buildRoutineFindingTitle("mbe-weekly-improve", "dark") },
    ];
    expect(findPriorRoutineFindingIssue(candidates, "mbe-weekly-improve")).toBe(11);
  });

  it("returns null when no candidate matches", () => {
    expect(findPriorRoutineFindingIssue([], "mbe-weekly-improve")).toBe(null);
  });
});

describe("buildRoutineFindingBody / buildRoutineFindingCreateArgs", () => {
  it("includes the routine name, trigger id, and action-required guidance", () => {
    const body = buildRoutineFindingBody({
      name: "mbe-weekly-improve",
      triggerId: "trig_01G12wULcCweXSb2jmVkChPW",
      status: "dark",
      periodDays: 7,
      reason: undefined,
      matched: null,
    });
    expect(body).toContain("mbe-weekly-improve");
    expect(body).toContain("trig_01G12wULcCweXSb2jmVkChPW");
    expect(body).toContain("Action Required");
  });

  it("builds create args carrying the ci-fix and ready labels", () => {
    const args = buildRoutineFindingCreateArgs("title", "body");
    expect(args).toEqual([
      "--title",
      "title",
      "--body",
      "body",
      "--label",
      "ci-fix",
      "--label",
      COORDINATION_LABELS.READY,
    ]);
  });
});

describe("parseRoutineCatalog", () => {
  it("extracts name and trigger id from a well-formed catalog table", () => {
    const markdown = [
      "| Routine | Trigger ID | Prompt file | Cadence (PT) | Cron (UTC) | Model | Output | Purpose |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| `mbe-weekly-improve` | `trig_01G12wULcCweXSb2jmVkChPW` | — | Fri | — | opus | 1 PR | — |",
      "| `mbe-deep-audit` | — (disabled; runs in GH Actions) | — | Mon | — | — | issues | — |",
      "",
      "## Next section",
    ].join("\n");

    expect(parseRoutineCatalog(markdown)).toEqual([
      { name: "mbe-weekly-improve", triggerId: "trig_01G12wULcCweXSb2jmVkChPW" },
      { name: "mbe-deep-audit", triggerId: null },
    ]);
  });

  it("returns an empty array when no catalog table header is present", () => {
    expect(parseRoutineCatalog("# just some prose\n\nno table here")).toEqual([]);
  });
});

describe("ROUTINE_MANIFEST coverage of docs/scheduled-tasks.md's catalog", () => {
  const markdown = readFileSync(resolve(ROOT, "docs", "scheduled-tasks.md"), "utf-8");
  const catalogRows = parseRoutineCatalog(markdown);

  it("parses a non-empty catalog from the real docs file", () => {
    expect(catalogRows.length).toBeGreaterThan(0);
  });

  it("has a manifest entry for every catalogued routine", () => {
    const manifestNames = new Set(ROUTINE_MANIFEST.map((entry) => entry.name));
    const missing = catalogRows
      .filter((row) => !manifestNames.has(row.name))
      .map((row) => row.name);
    expect(missing).toEqual([]);
  });

  it("declares either a signature, outOfScope, or unverifiable marker for every manifest entry — never silently unclassified", () => {
    const uncovered = ROUTINE_MANIFEST.filter(
      (entry) => !entry.signature && !entry.outOfScope && !entry.unverifiable
    ).map((entry) => entry.name);
    expect(uncovered).toEqual([]);
  });

  it("gives every outOfScope/unverifiable entry a human-readable reason", () => {
    const missingReason = ROUTINE_MANIFEST.filter(
      (entry) =>
        (entry.outOfScope && !entry.outOfScopeReason) ||
        (entry.unverifiable && !entry.unverifiableReason)
    ).map((entry) => entry.name);
    expect(missingReason).toEqual([]);
  });
});

// #5612: mbe-monthly-meta-audit had no declared liveness signature at all —
// the same gap #5344/#5373 closed for mbe-weekly-improve (mbe-daily-issue,
// #5605, graduated on 2026-09-25; see the block at the end of this file). Its
// docs/routines/*.md prompt now specifies a distinct, greppable PR title, but
// its manifest entry deliberately stays `unverifiable` until the live
// RemoteTrigger prompt at claude.ai is confirmed to emit it — identical fail-closed reasoning to mbe-night/mbe-midday
// (#5604/#5608): a signature that searches for a title nothing emits yet
// misclassifies a live routine as `dark`, strictly worse than an honest
// `unverifiable`.
//
// These assertions pin the two halves together — the title the prompt
// documents, and the concrete searchTerm the manifest's unverifiableReason
// promises the follow-up PR will flip to. If the two drift, that follow-up
// searches for a title nothing emits and a healthy routine reads `dark`.
describe("prompt-documented PR-title signatures pending live-trigger confirmation", () => {
  const PENDING_TRIGGER_CONFIRMATION = [
    {
      routine: "mbe-monthly-meta-audit",
      // It files `ready` issues too, but only "for the rest" — conditionally,
      // and under no distinct label. The ONE PR is its unconditional artifact,
      // so the signature keys on that.
      promptTitleConvention: "chore(meta): monthly meta-audit <YYYY-MM-DD>",
      plannedSearchTerm: "monthly meta-audit",
    },
  ];

  it.each(PENDING_TRIGGER_CONFIRMATION)(
    "$routine's prompt documents its own distinct PR title",
    ({ routine, promptTitleConvention }) => {
      const prompt = readFileSync(resolve(ROOT, "docs", "routines", `${routine}.md`), "utf-8");
      expect(prompt).toContain(promptTitleConvention);
    }
  );

  it.each(PENDING_TRIGGER_CONFIRMATION)(
    "$routine stays unverifiable, naming the searchTerm a follow-up PR flips to",
    ({ routine, plannedSearchTerm }) => {
      const entry = ROUTINE_MANIFEST.find((candidate) => candidate.name === routine);
      expect(entry.unverifiable).toBe(true);
      expect(entry.signature).toBeUndefined();
      expect(entry.unverifiableReason).toContain(`searchTerm: "${plannedSearchTerm}"`);
    }
  );
});

// The known-good fixture (#5552 acceptance criterion 3): running the checker
// against the 2026-09-13 -> 2026-09-20 window, as documented in the
// docs/process-retro.md 2026-09-20 entry's liveness table, must report
// mbe-weekly-improve dark and every other routine with a declared signature
// alive. Routines marked `unverifiable` in the manifest (mbe-night,
// mbe-midday, mbe-monthly-meta-audit — each has a prompt-documented title
// now, none confirmed live at the trigger yet) are
// asserted separately as `unverifiable`, not folded into the "every other
// routine" alive claim — they are real, distinct findings the manifest
// surfaces honestly rather than papering over with a fabricated signature.
describe("known-good fixture: 2026-09-13 -> 2026-09-20 window", () => {
  // End of day, not midnight — mbe-morning's ACMM PR lands at 16:03 UTC on
  // 09-20 itself, which would otherwise read as a future/negative-age
  // artifact relative to a midnight-of-09-20 "now" and be discarded.
  const now = "2026-09-20T23:59:59Z";

  // One representative observed artifact per verifiable routine, matching
  // the real conventions documented in docs/routines/*.md — every routine
  // EXCEPT mbe-weekly-improve, whose window is deliberately empty. Daily
  // routines (periodDays: 1) are dated on 09-20 itself, at roughly their
  // real UTC cron time (docs/scheduled-tasks.md's "Cron (UTC)" column) so
  // each is well within 24h of `now` — a `periodDays: 1` check is only ever
  // meaningful relative to a same-day "did today's run happen yet" moment,
  // not a whole retro week.
  const observedArtifactsByRoutine = {
    "mbe-evening": [
      {
        type: "pr",
        title: "chore(metrics): optimize-implement-queue 2026-09-20",
        observedAt: "2026-09-20T00:30:00Z", // cron 11 0 * * *
      },
    ],
    "mbe-night": [
      {
        type: "pr",
        title: "chore(metrics): night queue telemetry 2026-09-20",
        observedAt: "2026-09-20T05:00:00Z", // cron 47 4 * * *
      },
    ],
    "mbe-auditor": [
      { type: "issue", labels: ["ready", "audit"], observedAt: "2026-09-20T09:45:00Z" }, // cron 37 9 * * *
    ],
    "mbe-daily-issue": [
      {
        type: "pr",
        title: "fix(hospitality): guard the empty floor-plan render (mbe-daily-issue #5321)",
        observedAt: "2026-09-20T15:40:00Z", // cron 21 14 * * *, merged same session
      },
    ],
    "mbe-morning": [
      {
        type: "pr",
        title: "chore(acmm): daily audit 2026-09-20",
        observedAt: "2026-09-20T16:03:00Z", // cron 3 16 * * *
      },
    ],
    "mbe-learning-loop": [
      {
        type: "pr",
        title: "chore(metrics): learning-loop 2026-09-20",
        observedAt: "2026-09-20T18:10:00Z", // cron 0 18 * * *
      },
    ],
    "mbe-midday": [
      {
        type: "pr",
        title: "chore(metrics): midday queue telemetry 2026-09-20",
        observedAt: "2026-09-20T20:15:00Z", // cron 7 20 * * *
      },
    ],
    "mbe-weekly-improve": [],
    "mbe-doc-rot": [
      {
        type: "pr",
        title: "docs: weekly rot sweep 2026-09-18",
        observedAt: "2026-09-18T15:00:00Z",
      },
    ],
    "mbe-weekly-retro": [
      {
        type: "pr",
        title: "docs: weekly process retro 2026-09-14",
        observedAt: "2026-09-14T00:13:00Z",
      },
    ],
    "mbe-monthly-meta-audit": [
      {
        type: "pr",
        title: "chore(meta): monthly meta-audit 2026-09-01 — prune dangling CLAUDE.md paths",
        observedAt: "2026-09-01T14:20:00Z", // cron 0 14 1 * *
      },
    ],
  };

  // mbe-monthly-meta-audit (and mbe-night/mbe-midday) are `unverifiable` in
  // the manifest (see below) — runRoutineLivenessCheck files a finding for those
  // too, so createIssue must be a working stub here, not a throw.
  let nextIssueNumber = 1000;
  const results = runRoutineLivenessCheck({
    manifest: ROUTINE_MANIFEST,
    fetchObservedArtifacts: (entry) => observedArtifactsByRoutine[entry.name] ?? [],
    now,
    createIssue: () => nextIssueNumber++,
  });

  const byRoutine = Object.fromEntries(results.map((r) => [r.routine, r.status]));

  it("reports mbe-weekly-improve as dark", () => {
    expect(byRoutine["mbe-weekly-improve"]).toBe("dark");
  });

  // These three have artifacts in this fixture, dated with the distinct titles
  // their docs/routines/*.md prompts now specify (#5604/#5608 for
  // mbe-night/mbe-midday, #5612 for mbe-monthly-meta-audit) and are still NOT
  // alive (mbe-daily-issue graduated on 2026-09-25, #5748): the manifest keeps them `unverifiable` on purpose
  // until the live RemoteTrigger prompts are confirmed updated to actually emit
  // those titles (see routine-manifest.mjs unverifiableReason) — flipping the
  // manifest signature ahead of the live trigger would search for a title
  // nothing emits yet and misclassify a healthy routine as `dark`, worse than
  // `unverifiable`.
  const PROMPT_UPDATED_PENDING_TRIGGER_CONFIRMATION = [
    "mbe-night",
    "mbe-midday",
    "mbe-monthly-meta-audit",
  ];

  it("reports every other routine with a declared signature as alive", () => {
    for (const name of Object.keys(observedArtifactsByRoutine)) {
      if (
        name === "mbe-weekly-improve" ||
        PROMPT_UPDATED_PENDING_TRIGGER_CONFIRMATION.includes(name)
      )
        continue;
      expect(byRoutine[name]).toBe("alive");
    }
  });

  it("keeps every prompt-updated routine unverifiable until its live trigger is confirmed updated", () => {
    // The fixture gives each a real, in-window PR under its NEW title —
    // proving this is not the pre-fix "no artifact" gap. They still report
    // `unverifiable`, not `alive`, because the manifest has no live evidence
    // yet that the RemoteTrigger prompt (not just docs/routines/*.md) emits
    // this title.
    for (const name of PROMPT_UPDATED_PENDING_TRIGGER_CONFIRMATION) {
      expect(byRoutine[name]).toBe("unverifiable");
    }
  });

  // Named separately from the loop above: these two are the routines #5605 and
  // #5612 were filed against, and the finding must keep surfacing for them by
  // name rather than being silently omitted from the results.
  it("reports mbe-monthly-meta-audit as unverifiable, not silently omitted", () => {
    expect(byRoutine["mbe-monthly-meta-audit"]).toBe("unverifiable");
  });

  it("reports mbe-daily-issue as alive now that its live signature is confirmed (#5748)", () => {
    expect(byRoutine["mbe-daily-issue"]).toBe("alive");
  });

  it("excludes outOfScope entries (mbe-deep-audit, drift-fix) from the results entirely", () => {
    expect(byRoutine["mbe-deep-audit"]).toBeUndefined();
    expect(byRoutine["drift-fix"]).toBeUndefined();
  });
});

describe("runRoutineLivenessCheck — issue filing (dedup)", () => {
  const now = "2026-09-20T00:00:00Z";
  const darkManifest = [
    {
      name: "mbe-weekly-improve",
      triggerId: "trig_01G12wULcCweXSb2jmVkChPW",
      periodDays: 7,
      signature: PR_TITLE_SIGNATURE,
    },
  ];

  it("creates a new issue when no prior finding exists", () => {
    const created = [];
    const results = runRoutineLivenessCheck({
      manifest: darkManifest,
      fetchObservedArtifacts: () => [],
      now,
      searchCiFixIssues: () => [],
      createIssue: (title, body) => {
        created.push({ title, body });
        return 101;
      },
    });
    expect(created).toHaveLength(1);
    expect(results[0]).toMatchObject({
      routine: "mbe-weekly-improve",
      status: "dark",
      action: "create",
      issueNumber: 101,
    });
  });

  it("skips filing a duplicate when an open finding issue already exists for the routine", () => {
    const priorTitle = buildRoutineFindingTitle("mbe-weekly-improve", "dark");
    const created = [];
    const results = runRoutineLivenessCheck({
      manifest: darkManifest,
      fetchObservedArtifacts: () => [],
      now,
      searchCiFixIssues: () => [{ number: 42, title: priorTitle }],
      getIssueState: () => "open",
      createIssue: (title, body) => {
        created.push({ title, body });
        return 999;
      },
    });
    expect(created).toHaveLength(0);
    expect(results[0]).toMatchObject({
      routine: "mbe-weekly-improve",
      status: "dark",
      action: "skip",
      issueNumber: 42,
    });
  });

  it("reopens a previously closed finding issue rather than creating a duplicate", () => {
    const priorTitle = buildRoutineFindingTitle("mbe-weekly-improve", "dark");
    const reopened = [];
    const results = runRoutineLivenessCheck({
      manifest: darkManifest,
      fetchObservedArtifacts: () => [],
      now,
      searchCiFixIssues: () => [{ number: 42, title: priorTitle }],
      getIssueState: () => "closed",
      createIssue: () => {
        throw new Error("should not create when a closed prior issue can be reopened");
      },
      reopenIssue: (issueNumber) => reopened.push(issueNumber),
    });
    expect(reopened).toEqual([42]);
    expect(results[0]).toMatchObject({
      routine: "mbe-weekly-improve",
      status: "dark",
      action: "reopen",
      issueNumber: 42,
    });
  });

  it("does not file anything for an alive routine", () => {
    const created = [];
    const results = runRoutineLivenessCheck({
      manifest: darkManifest,
      fetchObservedArtifacts: () => [
        {
          type: "pr",
          title: "fix(routines): weekly improve 2026-09-19 — foo",
          observedAt: "2026-09-19T00:00:00Z",
        },
      ],
      now,
      createIssue: (title, body) => {
        created.push({ title, body });
        return 1;
      },
    });
    expect(created).toHaveLength(0);
    expect(results[0]).toMatchObject({ routine: "mbe-weekly-improve", status: "alive" });
  });
});

/**
 * This producer files every day, so its dedupe is load-bearing in a way a
 * once-a-week producer's is not. Failing open on a broken search — "proceed as
 * no-match, file it anyway" — turns one outage into one duplicate per routine
 * per day, and the finding it protects is already on the issue the search could
 * not see.
 */
describe("dedupe search failure", () => {
  const DARK_MANIFEST = [
    {
      name: "mbe-test-routine",
      triggerId: "trig_test",
      periodDays: 1,
      signature: { type: "pr-title", pattern: String.raw`nothing matches this`, searchTerm: "x" },
    },
  ];

  it("files nothing when the search throws, rather than duplicating", () => {
    const created = [];
    const logs = [];
    const results = runRoutineLivenessCheck({
      manifest: DARK_MANIFEST,
      fetchObservedArtifacts: () => [],
      now: "2026-09-20T12:00:00Z",
      searchCiFixIssues: () => {
        throw new Error("gh: rate limited");
      },
      createIssue: (title) => {
        created.push(title);
        return 1;
      },
      log: (msg) => logs.push(msg),
    });

    expect(created).toEqual([]);
    expect(results).toEqual([
      { routine: "mbe-test-routine", status: "dark", action: "search-failed" },
    ]);
    expect(logs.join("\n")).toMatch(/not filing/i);
  });

  it("still files when the search succeeds and finds no prior issue", () => {
    const created = [];
    runRoutineLivenessCheck({
      manifest: DARK_MANIFEST,
      fetchObservedArtifacts: () => [],
      now: "2026-09-20T12:00:00Z",
      searchCiFixIssues: () => [],
      createIssue: (title) => {
        created.push(title);
        return 1;
      },
    });
    expect(created).toHaveLength(1);
  });
});

describe("isObservationBlackout", () => {
  const signed = (n) => ({ hasSignature: true, observedCount: n });
  const unsigned = { hasSignature: false, observedCount: 0 };

  it("is true when every signature-bearing routine observed nothing", () => {
    expect(isObservationBlackout([signed(0), signed(0), unsigned])).toBe(true);
  });

  it("is false when any signature-bearing routine observed something", () => {
    // One routine genuinely dark among healthy ones must still be filed.
    expect(isObservationBlackout([signed(0), signed(12), signed(0)])).toBe(false);
  });

  it("is false for a lone signature-bearing routine — one observer cannot tell", () => {
    // With a single observer, "the query is broken" and "this routine has
    // genuinely never produced a match" are indistinguishable. Suppressing it
    // would swallow the finding this checker exists to make.
    expect(isObservationBlackout([signed(0)])).toBe(false);
    expect(isObservationBlackout([signed(0), unsigned])).toBe(false);
  });

  it("is false when there is nothing signature-bearing to judge", () => {
    // A manifest of only unverifiable/out-of-scope entries is not a blackout —
    // those are filed on their own merits and must not be suppressed.
    expect(isObservationBlackout([unsigned, unsigned])).toBe(false);
    expect(isObservationBlackout([])).toBe(false);
  });

  it("ignores unsigned entries when deciding", () => {
    expect(isObservationBlackout([signed(3), unsigned])).toBe(false);
  });
});

describe("runRoutineLivenessCheck — observation blackout (#5606)", () => {
  const manifest = [
    { name: "alpha", triggerId: "t1", periodDays: 1, signature: PR_TITLE_SIGNATURE },
    { name: "beta", triggerId: "t2", periodDays: 1, signature: PR_TITLE_SIGNATURE },
  ];

  it("files nothing when every signature-bearing routine observed zero artifacts", () => {
    const created = [];
    const results = runRoutineLivenessCheck({
      manifest,
      fetchObservedArtifacts: () => [],
      now: "2026-09-21T15:04:00Z",
      createIssue: (args) => {
        created.push(args);
        return "https://github.com/o/r/issues/1";
      },
    });

    expect(created).toEqual([]);
    expect(results.map((r) => r.status)).toEqual(["unobserved", "unobserved"]);
  });

  it("still files a genuinely dark routine when a sibling observed artifacts", () => {
    // The guard must only suppress a RUN-WIDE blackout, never a real finding.
    const created = [];
    runRoutineLivenessCheck({
      manifest,
      fetchObservedArtifacts: (entry) =>
        entry.name === "alpha"
          ? [
              {
                type: "pr",
                title: "chore(metrics): weekly improve 2026-09-21",
                observedAt: "2026-09-21T14:00:00Z",
              },
            ]
          : [],
      now: "2026-09-21T15:04:00Z",
      createIssue: (args) => {
        created.push(args);
        return "https://github.com/o/r/issues/1";
      },
    });

    expect(created).toHaveLength(1);
    expect(JSON.stringify(created[0])).toContain("beta");
    expect(JSON.stringify(created[0])).not.toContain("alpha");
  });

  it("logs an observed-artifact count per signature-bearing routine", () => {
    // The diagnostic gap that made #5606 a reconstruction instead of a lookup:
    // the run log recorded verdicts but never what was seen.
    const lines = [];
    runRoutineLivenessCheck({
      manifest,
      fetchObservedArtifacts: () => [],
      now: "2026-09-21T15:04:00Z",
      createIssue: () => "https://github.com/o/r/issues/1",
      log: (line) => lines.push(line),
    });

    expect(lines.some((l) => /observed 0 candidate artifact\(s\) for alpha/.test(l))).toBe(true);
    expect(lines.some((l) => /observed 0 candidate artifact\(s\) for beta/.test(l))).toBe(true);
  });
});

// #5748: the live mbe-daily-issue trigger was confirmed on 2026-09-25 by PR
// #5763, titled "docs(routines): fix nonexistent /schedule skill references
// (mbe-daily-issue #5759)". Its manifest entry now carries the real signature.
// This routine CLOSES an existing issue rather than filing one, so an
// `issue-label` signature would key off the issue's createdAt, not the run;
// the PR is its only artifact of its own, and the marker is a title suffix.
describe("PR-title signatures confirmed against a live routine run", () => {
  it("mbe-daily-issue matches the suffix its live trigger emits", () => {
    const entry = ROUTINE_MANIFEST.find((candidate) => candidate.name === "mbe-daily-issue");
    expect(entry.unverifiable).toBeUndefined();
    expect(entry.signature).toMatchObject({ type: "pr-title", searchTerm: "mbe-daily-issue" });
    const pattern = new RegExp(entry.signature.pattern);
    expect(
      pattern.test(
        "docs(routines): fix nonexistent /schedule skill references (mbe-daily-issue #5759)"
      )
    ).toBe(true);
    expect(pattern.test("fix(reservations): an ordinary implement-queue PR (#5759)")).toBe(false);
  });

  it("mbe-daily-issue's prompt still documents that suffix", () => {
    const prompt = readFileSync(resolve(ROOT, "docs", "routines", "mbe-daily-issue.md"), "utf-8");
    expect(prompt).toContain("(mbe-daily-issue #<ISSUE>)");
  });
});

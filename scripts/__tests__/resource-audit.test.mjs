import { describe, test, expect } from "vitest";
import {
  isAllowlisted,
  findOrphanedWorkers,
  findOrphanedDoApps,
  findOrphanedDnsRecords,
  buildReport,
  findPriorResourceAuditIssue,
  decideOrphanCountRefresh,
  refreshTrackedCount,
  extractZoneId,
} from "../resource-audit.mjs";

describe("isAllowlisted", () => {
  test("matches a string entry by exact name", () => {
    const allowlist = { workers: ["legacy-worker"] };
    expect(isAllowlisted({ name: "legacy-worker" }, "workers", allowlist)).toBe(true);
  });

  test("matches an object entry by name when no type is specified", () => {
    const allowlist = { digitalocean_apps: [{ name: "sandbox-app" }] };
    expect(isAllowlisted({ name: "sandbox-app" }, "digitalocean_apps", allowlist)).toBe(true);
  });

  test("boundary: name matches but explicit type differs — not allowlisted", () => {
    const allowlist = { dns_records: [{ name: "www", type: "CNAME" }] };
    expect(isAllowlisted({ name: "www", type: "A" }, "dns_records", allowlist)).toBe(false);
  });

  test("returns false when no entry matches the name", () => {
    const allowlist = { workers: ["other-worker"] };
    expect(isAllowlisted({ name: "legacy-worker" }, "workers", allowlist)).toBe(false);
  });

  test("boundary: category missing from allowlist — treated as empty list", () => {
    const allowlist = {};
    expect(isAllowlisted({ name: "anything" }, "workers", allowlist)).toBe(false);
  });
});

describe("findOrphanedWorkers", () => {
  const allowlist = { workers: ["allowlisted-worker"] };

  test("excludes workers known from code", () => {
    const known = new Set(["known-worker"]);
    const result = findOrphanedWorkers(["known-worker"], known, allowlist);
    expect(result).toEqual([]);
  });

  test("excludes allowlisted workers", () => {
    const known = new Set();
    const result = findOrphanedWorkers(["allowlisted-worker"], known, allowlist);
    expect(result).toEqual([]);
  });

  test("flags a worker as orphaned when unknown and not allowlisted", () => {
    const known = new Set();
    const result = findOrphanedWorkers(["mystery-worker"], known, allowlist);
    expect(result).toEqual(["mystery-worker"]);
  });
});

describe("findOrphanedDoApps", () => {
  const allowlist = { digitalocean_apps: [{ name: "allowlisted-app" }] };

  test("excludes apps known from code", () => {
    const known = new Set(["known-app"]);
    const result = findOrphanedDoApps([{ id: "1", name: "known-app" }], known, allowlist);
    expect(result).toEqual([]);
  });

  test("excludes allowlisted apps", () => {
    const known = new Set();
    const result = findOrphanedDoApps([{ id: "2", name: "allowlisted-app" }], known, allowlist);
    expect(result).toEqual([]);
  });

  test("flags an app as orphaned when unknown and not allowlisted", () => {
    const known = new Set();
    const result = findOrphanedDoApps([{ id: "3", name: "mystery-app" }], known, allowlist);
    expect(result).toEqual([{ id: "3", name: "mystery-app" }]);
  });
});

describe("findOrphanedDnsRecords", () => {
  const domain = "example.com";
  const allowlist = { dns_records: [] };

  test("excludes a live record matching a known record by normalized name + type", () => {
    const known = [{ name: "www", type: "A" }];
    const live = [{ id: "1", name: "www.example.com", type: "A", content: "1.2.3.4" }];
    expect(findOrphanedDnsRecords(live, known, allowlist, domain)).toEqual([]);
  });

  test("boundary: same normalized name but different type is still orphaned", () => {
    const known = [{ name: "www", type: "CNAME" }];
    const live = [{ id: "1", name: "www.example.com", type: "A", content: "1.2.3.4" }];
    const result = findOrphanedDnsRecords(live, known, allowlist, domain);
    expect(result).toEqual(live);
  });

  test("normalizes the root domain to '@' before comparing", () => {
    const known = [{ name: "@", type: "A" }];
    const live = [{ id: "1", name: "example.com", type: "A", content: "1.2.3.4" }];
    expect(findOrphanedDnsRecords(live, known, allowlist, domain)).toEqual([]);
  });

  test("excludes an allowlisted record even when not known", () => {
    const known = [];
    const live = [{ id: "1", name: "staging.example.com", type: "A", content: "1.2.3.4" }];
    const withAllowlist = { dns_records: [{ name: "staging", type: "A" }] };
    expect(findOrphanedDnsRecords(live, known, withAllowlist, domain)).toEqual([]);
  });
});

describe("buildReport", () => {
  test("boundary: returns null when nothing is orphaned", () => {
    expect(buildReport([], [], [])).toBeNull();
  });

  test("includes only the sections for categories with orphans", () => {
    const report = buildReport(["orphan-worker"], [], []);
    expect(report.title).toBe("Orphaned resources found (1)");
    // The count is returned as a field, not only interpolated into the title —
    // the refresh path compares numbers and must not re-parse its own prose.
    expect(report.totalOrphaned).toBe(1);
    expect(report.body).toContain("### Cloudflare Workers (1)");
    expect(report.body).not.toContain("### DigitalOcean Apps");
    expect(report.body).not.toContain("### Cloudflare DNS Records");
  });

  test("aggregates the total count across all categories", () => {
    const report = buildReport(
      ["orphan-worker"],
      [{ id: "1", name: "orphan-app" }],
      [{ id: "2", name: "orphan.example.com", type: "A", content: "1.2.3.4" }]
    );
    expect(report.title).toBe("Orphaned resources found (3)");
  });
});

// ---------------------------------------------------------------------------
// findPriorResourceAuditIssue — the #3775 dedup ledger lookup. Previously
// this producer had no dedup at all (a fresh issue was filed every run);
// this is an intentional behavior change, matching the fixed-title-prefix
// search strategy `buildReport`'s varying-count title requires.
// ---------------------------------------------------------------------------

describe("findPriorResourceAuditIssue", () => {
  test("finds a prior resource-audit issue by title prefix, regardless of count", () => {
    const candidates = [{ number: 3, title: "Orphaned resources found (2)" }];
    expect(findPriorResourceAuditIssue(candidates)).toBe(3);
  });

  test("matches regardless of state — feeds the reopen path for a closed prior issue", () => {
    const candidates = [{ number: 3, title: "Orphaned resources found (5)", state: "closed" }];
    expect(findPriorResourceAuditIssue(candidates)).toBe(3);
  });

  test("returns null when no candidate matches the title prefix", () => {
    const candidates = [{ number: 3, title: "unrelated issue" }];
    expect(findPriorResourceAuditIssue(candidates)).toBeNull();
  });

  test("returns null for empty or nullish input", () => {
    expect(findPriorResourceAuditIssue([])).toBeNull();
    expect(findPriorResourceAuditIssue(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractZoneId — resolves the CF zone ID for the audited domain from the
// CF `/zones?name=` response, replacing a `CLOUDFLARE_ZONE_ID` secret that
// was never provisioned (see .claude/rules/gotchas.md and docs/SECRETS.md,
// where every other consumer authenticates via MBE_CLOUDFLARE_API_TOKEN and
// none needs a zone-id secret — Pulumi derives it from non-secret config).
// ---------------------------------------------------------------------------

describe("extractZoneId", () => {
  test("finds the zone matching the domain", () => {
    const zones = [{ id: "zone-1", name: "example.com" }];
    expect(extractZoneId(zones, "example.com")).toBe("zone-1");
  });

  test("returns null when no zone matches the domain", () => {
    const zones = [{ id: "zone-1", name: "other.com" }];
    expect(extractZoneId(zones, "example.com")).toBeNull();
  });

  test("boundary: empty or nullish zones list returns null", () => {
    expect(extractZoneId([], "example.com")).toBeNull();
    expect(extractZoneId(null, "example.com")).toBeNull();
  });
});

/**
 * The dedupe added in #3775 stopped the weekly audit filing a fresh issue
 * every run — and, unintentionally, stopped it saying anything at all. The
 * open tracker (#4670) was filed on 2026-08-29 reading `Orphaned resources
 * found (165)`; on 2026-09-19 the audit measured 199 and logged
 * `Skipping — issue #4670 already tracks this`, leaving the title, the body
 * and every number a triager reads three weeks and 34 resources stale.
 *
 * A count that only moves in the run log is not tracked. These cases pin the
 * decision, including the deliberate silence when nothing changed — the audit
 * writes to the issue it measures, so a weekly no-op comment would bump
 * `updatedAt` and destroy it as a staleness signal (gotchas § Metrics /
 * staleness detection).
 */
describe("decideOrphanCountRefresh", () => {
  test("refreshes when the tracked count has grown — the real #4670 case", () => {
    expect(
      decideOrphanCountRefresh({
        priorTitle: "Orphaned resources found (165)",
        currentCount: 199,
      })
    ).toEqual({ action: "refresh", from: 165, to: 199 });
  });

  test("refreshes when the count has shrunk, so cleanup progress is visible too", () => {
    expect(
      decideOrphanCountRefresh({ priorTitle: "Orphaned resources found (199)", currentCount: 12 })
    ).toEqual({ action: "refresh", from: 199, to: 12 });
  });

  test("stays silent when the count is unchanged, leaving updatedAt honest", () => {
    expect(
      decideOrphanCountRefresh({ priorTitle: "Orphaned resources found (199)", currentCount: 199 })
    ).toEqual({ action: "none" });
  });

  test("refreshes when the prior title carries no parsable count", () => {
    expect(
      decideOrphanCountRefresh({ priorTitle: "Orphaned resources found", currentCount: 7 })
    ).toEqual({ action: "refresh", from: null, to: 7 });
  });

  test("refreshes on a missing prior title rather than assuming it matches", () => {
    expect(decideOrphanCountRefresh({ priorTitle: undefined, currentCount: 0 })).toEqual({
      action: "refresh",
      from: null,
      to: 0,
    });
  });
});

/**
 * The decision above is only worth having if something acts on it. This is the
 * seam where a correct decision could still reach nobody — the exact shape of
 * the defect being fixed, where `fileIssue()` returned `skip` and the branch
 * that received it did nothing but `console.log`.
 */
describe("refreshTrackedCount", () => {
  function fakeGhClient() {
    const calls = { edit: [], comment: [] };
    return {
      calls,
      issue: {
        edit: (number, args) => calls.edit.push([number, args]),
        comment: (number, body) => calls.comment.push([number, body]),
      },
    };
  }

  test("edits the issue and comments the delta when the count moved", () => {
    const gh = fakeGhClient();
    refreshTrackedCount(
      gh,
      4670,
      "Orphaned resources found (165)",
      "Orphaned resources found (199)",
      "body",
      199
    );

    expect(gh.calls.edit).toEqual([
      [4670, ["--title", "Orphaned resources found (199)", "--body", "body"]],
    ]);
    expect(gh.calls.comment).toHaveLength(1);
    expect(gh.calls.comment[0][0]).toBe(4670);
    expect(gh.calls.comment[0][1]).toContain("**199**");
    expect(gh.calls.comment[0][1]).toContain("was 165");
  });

  test("writes nothing at all when the count is unchanged", () => {
    const gh = fakeGhClient();
    refreshTrackedCount(gh, 4670, "Orphaned resources found (199)", "x", "y", 199);
    expect(gh.calls.edit).toEqual([]);
    expect(gh.calls.comment).toEqual([]);
  });

  test("still comments when the edit throws, so the finding is never lost", () => {
    const gh = fakeGhClient();
    gh.issue.edit = () => {
      throw new Error("gh issue edit: GraphQL error on a Projects-classic field");
    };
    refreshTrackedCount(gh, 4670, "Orphaned resources found (165)", "t", "b", 12);
    expect(gh.calls.comment).toHaveLength(1);
    expect(gh.calls.comment[0][1]).toContain("**12**");
  });
});

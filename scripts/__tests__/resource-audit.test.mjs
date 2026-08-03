import { describe, test, expect } from "vitest";
import {
  isAllowlisted,
  findOrphanedWorkers,
  findOrphanedDoApps,
  findOrphanedDnsRecords,
  buildReport,
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

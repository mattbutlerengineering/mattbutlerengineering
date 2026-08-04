import { describe, it, expect, vi } from "vitest";
import {
  ROTATION_SCHEDULE,
  REQUIRED_LABELS,
  getDueSecrets,
  issueTitleFor,
  formatIssueBody,
  validateLabels,
  findPriorReminderIssue,
  runSecretRotationReminder,
} from "../secret-rotation-reminder.mjs";

// ---------------------------------------------------------------------------
// getDueSecrets — pure calendar-cadence logic
// ---------------------------------------------------------------------------

describe("getDueSecrets", () => {
  it("includes a quarterly secret in a month past its rotation threshold (January)", () => {
    const names = getDueSecrets(1).map((s) => s.name);
    expect(names).toContain("DIGITALOCEAN_TOKEN");
  });

  it("excludes that same secret in a month under its rotation threshold (February)", () => {
    const names = getDueSecrets(2).map((s) => s.name);
    expect(names).not.toContain("DIGITALOCEAN_TOKEN");
  });

  it("returns no secrets due in a month with no quarterly or semi-annual anchor", () => {
    expect(getDueSecrets(2)).toEqual([]);
    expect(getDueSecrets(3)).toEqual([]);
  });

  it("includes both quarterly and semi-annual secrets in January", () => {
    const names = getDueSecrets(1).map((s) => s.name);
    expect(names).toContain("DIGITALOCEAN_TOKEN"); // quarterly
    expect(names).toContain("AUTH0_CLIENT_SECRET"); // semi-annual
  });

  it("includes only quarterly secrets in April", () => {
    const names = getDueSecrets(4).map((s) => s.name);
    expect(names).toContain("DIGITALOCEAN_TOKEN");
    expect(names).not.toContain("AUTH0_CLIENT_SECRET");
  });

  it("every entry in ROTATION_SCHEDULE is due in exactly one of Jan/Apr/Jul/Oct or Jan/Jul", () => {
    for (const secret of ROTATION_SCHEDULE) {
      const dueMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
        getDueSecrets(m).some((s) => s.name === secret.name)
      );
      expect(dueMonths.length).toBe(12 / secret.intervalMonths);
    }
  });
});

// ---------------------------------------------------------------------------
// issueTitleFor / formatIssueBody — pure formatting
// ---------------------------------------------------------------------------

describe("issueTitleFor", () => {
  it("formats the month name and year", () => {
    expect(issueTitleFor(1, 2026)).toBe("chore: rotate secrets due January 2026");
    expect(issueTitleFor(7, 2027)).toBe("chore: rotate secrets due July 2027");
  });
});

describe("formatIssueBody", () => {
  it("names each due secret and its rotation cadence", () => {
    const body = formatIssueBody(getDueSecrets(1), 1, 2026);
    expect(body).toContain("DIGITALOCEAN_TOKEN");
    expect(body).toContain("rotates every 3 months");
    expect(body).toContain("AUTH0_CLIENT_SECRET");
    expect(body).toContain("rotates every 6 months");
  });
});

// ---------------------------------------------------------------------------
// validateLabels — pure label existence check
// ---------------------------------------------------------------------------

describe("validateLabels", () => {
  it("is valid when every required label exists", () => {
    expect(validateLabels(["security", "ready", "other"])).toEqual({
      valid: true,
      missing: [],
    });
  });

  it("reports the missing label by name when one is absent", () => {
    expect(validateLabels(["security"])).toEqual({
      valid: false,
      missing: ["ready"],
    });
  });

  it("reports all missing labels when several are absent", () => {
    expect(validateLabels([])).toEqual({
      valid: false,
      missing: ["security", "ready"],
    });
  });

  it("REQUIRED_LABELS does not include chore", () => {
    expect(REQUIRED_LABELS).not.toContain("chore");
    expect(REQUIRED_LABELS).toEqual(["security", "ready"]);
  });
});

// ---------------------------------------------------------------------------
// findPriorReminderIssue — the #3775 dedup ledger lookup (any state, so a
// previously-closed reminder for this exact month/year can be reopened).
// ---------------------------------------------------------------------------

describe("findPriorReminderIssue", () => {
  const title = "chore: rotate secrets due January 2026";

  it("finds a candidate issue with the exact same title", () => {
    expect(findPriorReminderIssue([{ number: 5, title }], title)).toBe(5);
  });

  it("matches case-insensitively", () => {
    expect(findPriorReminderIssue([{ number: 5, title: title.toUpperCase() }], title)).toBe(5);
  });

  it("returns null when no candidate matches", () => {
    expect(findPriorReminderIssue([{ number: 5, title: "some other issue" }], title)).toBeNull();
  });

  it("returns null for an empty issue list", () => {
    expect(findPriorReminderIssue([], title)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runSecretRotationReminder — orchestration with injected gh ops
// ---------------------------------------------------------------------------

describe("runSecretRotationReminder", () => {
  const JAN_2026 = Date.parse("2026-01-15T09:00:00Z");
  const FEB_2026 = Date.parse("2026-02-15T09:00:00Z");

  const makeDeps = (overrides = {}) => ({
    listLabels: vi.fn(async () => ["security", "ready"]),
    listIssuesByLabel: vi.fn(async () => []),
    getIssueState: vi.fn(() => "missing"),
    createIssue: vi.fn(() => 1),
    reopenIssue: vi.fn(),
    log: vi.fn(),
    ...overrides,
  });

  it("creates a reminder issue with due secrets and required labels", async () => {
    const deps = makeDeps();
    const result = await runSecretRotationReminder({ ...deps, now: JAN_2026 });

    expect(result.created).toBe(true);
    expect(deps.createIssue).toHaveBeenCalledTimes(1);
    const [title, body, labels] = deps.createIssue.mock.calls[0];
    expect(title).toBe("chore: rotate secrets due January 2026");
    expect(labels).toEqual(["security", "ready"]);
    expect(body).toContain("DIGITALOCEAN_TOKEN");
  });

  it("does nothing when no secrets are due this month", async () => {
    const deps = makeDeps();
    const result = await runSecretRotationReminder({ ...deps, now: FEB_2026 });

    expect(result.created).toBe(false);
    expect(deps.listLabels).not.toHaveBeenCalled();
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("skips creation when a reminder for the same month is already open (no duplicate)", async () => {
    const deps = makeDeps({
      listIssuesByLabel: vi.fn(async () => [
        { number: 9, title: "chore: rotate secrets due January 2026" },
      ]),
      getIssueState: vi.fn(() => "open"),
    });
    const result = await runSecretRotationReminder({ ...deps, now: JAN_2026 });

    expect(result.created).toBe(false);
    expect(result.skipped).toBe(true);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("reopens a previously-closed reminder for the same month instead of filing a duplicate (#3775 improvement)", async () => {
    const deps = makeDeps({
      listIssuesByLabel: vi.fn(async () => [
        { number: 9, title: "chore: rotate secrets due January 2026" },
      ]),
      getIssueState: vi.fn(() => "closed"),
    });
    const result = await runSecretRotationReminder({ ...deps, now: JAN_2026 });

    expect(result.created).toBe(true);
    expect(deps.reopenIssue).toHaveBeenCalledWith(9);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("throws a clear error naming the missing label and does not create an issue", async () => {
    const deps = makeDeps({ listLabels: vi.fn(async () => ["ready"]) });

    await expect(runSecretRotationReminder({ ...deps, now: JAN_2026 })).rejects.toThrow(/security/);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("does not swallow errors thrown by createIssue", async () => {
    const deps = makeDeps({
      createIssue: vi.fn(() => {
        throw new Error("gh issue create failed");
      }),
    });

    await expect(runSecretRotationReminder({ ...deps, now: JAN_2026 })).rejects.toThrow(
      "gh issue create failed"
    );
  });

  it("fails open (treats as no-match, still files) when the search itself throws", async () => {
    const deps = makeDeps({
      listIssuesByLabel: vi.fn(async () => {
        throw new Error("gh rate limited");
      }),
    });

    const result = await runSecretRotationReminder({ ...deps, now: JAN_2026 });

    expect(result.created).toBe(true);
    expect(deps.createIssue).toHaveBeenCalledTimes(1);
  });
});

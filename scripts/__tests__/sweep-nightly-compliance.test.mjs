import { describe, it, expect, vi } from "vitest";
import { parseArgs, buildCloseComment, runSweepCli } from "../sweep-nightly-compliance.mjs";

function reportWithFailures(names) {
  const lines = ["## Gating scripts", ""];
  for (const name of names) {
    lines.push(`- ✗ \`${name}\` FAILED`, "", "  ```", `  ${name} broke`, "  ```", "");
  }
  return lines.join("\n");
}

describe("parseArgs", () => {
  it("parses a full request", () => {
    const opts = parseArgs([
      "--report",
      "/tmp/report.md",
      "--exclude-issue",
      "42",
      "--new-issue-url",
      "https://github.com/o/r/issues/42",
    ]);

    expect(opts).toEqual({
      reportPath: "/tmp/report.md",
      excludeIssue: 42,
      newIssueUrl: "https://github.com/o/r/issues/42",
    });
  });

  it("throws when --report is missing", () => {
    expect(() => parseArgs(["--new-issue-url", "u"])).toThrow(/--report/);
  });

  it("throws when --new-issue-url is missing", () => {
    expect(() => parseArgs(["--report", "/tmp/report.md"])).toThrow(/--new-issue-url/);
  });

  it("throws on an unknown flag", () => {
    expect(() => parseArgs(["--report", "r", "--new-issue-url", "u", "--bogus", "x"])).toThrow(
      /Unknown flag/
    );
  });
});

describe("buildCloseComment", () => {
  it("links the new issue and never closes silently", () => {
    const comment = buildCloseComment("https://github.com/o/r/issues/42");
    expect(comment).toContain("https://github.com/o/r/issues/42");
    expect(comment.toLowerCase()).toContain("superseded");
  });
});

describe("runSweepCli", () => {
  it("closes only the candidates whose failures are superseded, excluding the current issue", () => {
    const newReport = reportWithFailures(["check-deploy-sha", "check-api-surface-invariants"]);
    const closeIssue = vi.fn();
    const deps = {
      readFile: () => newReport,
      searchOpenIssues: () => [
        {
          number: 100,
          title: "[nightly-compliance 2026-09-13] Drift detected",
          body: reportWithFailures(["check-deploy-sha"]),
        },
        {
          number: 101,
          title: "[nightly-compliance 2026-09-14] Drift detected",
          body: reportWithFailures(["apps/rialto-web#test"]),
        },
        { number: 102, title: "[nightly-compliance 2026-09-16] Drift detected", body: newReport },
      ],
      closeIssue,
    };

    const result = runSweepCli(
      [
        "--report",
        "/tmp/report.md",
        "--exclude-issue",
        "102",
        "--new-issue-url",
        "https://github.com/o/r/issues/102",
      ],
      deps
    );

    expect(result).toEqual({ closed: [100] });
    expect(closeIssue).toHaveBeenCalledTimes(1);
    expect(closeIssue).toHaveBeenCalledWith(100, expect.stringContaining("issues/102"));
  });

  it("ignores issues that don't carry the nightly-compliance title prefix", () => {
    const newReport = reportWithFailures(["check-deploy-sha"]);
    const closeIssue = vi.fn();
    const deps = {
      readFile: () => newReport,
      searchOpenIssues: () => [
        {
          number: 200,
          title: "Some unrelated meta-improvement issue",
          body: reportWithFailures(["check-deploy-sha"]),
        },
      ],
      closeIssue,
    };

    const result = runSweepCli(
      [
        "--report",
        "/tmp/report.md",
        "--exclude-issue",
        "999",
        "--new-issue-url",
        "https://github.com/o/r/issues/999",
      ],
      deps
    );

    expect(result).toEqual({ closed: [] });
    expect(closeIssue).not.toHaveBeenCalled();
  });

  it("treats a failed search as nothing-to-sweep rather than throwing", () => {
    const closeIssue = vi.fn();
    const deps = {
      readFile: () => reportWithFailures(["check-deploy-sha"]),
      searchOpenIssues: () => {
        throw new Error("gh: network error");
      },
      closeIssue,
    };

    const result = runSweepCli(
      [
        "--report",
        "/tmp/report.md",
        "--exclude-issue",
        "1",
        "--new-issue-url",
        "https://github.com/o/r/issues/1",
      ],
      deps
    );

    expect(result).toEqual({ closed: [] });
    expect(closeIssue).not.toHaveBeenCalled();
  });
});

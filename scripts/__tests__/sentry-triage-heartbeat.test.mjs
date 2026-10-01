import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyTriageIssues, renderSkipTally } from "../sentry-triage-heartbeat.mjs";

const OPTIONS = { severityThreshold: 5, period: "14d" };
const busyWindow = { "14d": [[1_759_000_000, 40]] };

const heartbeat = {
  id: "7765128186",
  title: "Error: mbe-round-trip-20261001T041130897Z-spikehosp sentry heartbeat",
  level: "error",
  count: "40",
  stats: busyWindow,
};
const realIssue = {
  id: "1",
  title: "TypeError: Cannot read properties of undefined (reading 'venueId')",
  level: "error",
  count: "40",
  stats: busyWindow,
};

describe("classifyTriageIssues", () => {
  it("never files a heartbeat issue, even far above the event threshold (SC-9)", () => {
    const [classified] = classifyTriageIssues([heartbeat], OPTIONS);
    expect(classified).toMatchObject({ id: heartbeat.id, actionable: false, reason: "heartbeat" });
  });

  it("counts dropped heartbeats in the skip tally, so the filter is visible", () => {
    expect(renderSkipTally(classifyTriageIssues([heartbeat, realIssue], OPTIONS))).toBe(
      "heartbeat=1"
    );
  });

  it("leaves a real issue's classification unchanged", () => {
    const [classified] = classifyTriageIssues([realIssue], OPTIONS);
    expect(classified).toMatchObject({
      actionable: true,
      reason: "actionable",
      eventsInWindow: 40,
    });
  });

  it("renders an empty tally as 'none'", () => {
    expect(renderSkipTally(classifyTriageIssues([realIssue], OPTIONS))).toBe("none");
  });
});

describe("triage.mjs", () => {
  it("classifies through classifyTriageIssues, so the heartbeat filter is actually wired in", () => {
    const triage = readFileSync(
      fileURLToPath(
        new URL("../../.claude/skills/sentry-triage/scripts/triage.mjs", import.meta.url)
      ),
      "utf8"
    );
    expect(triage).toMatch(
      /import \{[^}]*classifyTriageIssues[^}]*\} from "[./]+scripts\/sentry-triage-heartbeat\.mjs"/
    );
    expect(triage).toContain("classifyTriageIssues(allIssues");
    expect(triage).toContain("renderSkipTally(classified)");
  });
});

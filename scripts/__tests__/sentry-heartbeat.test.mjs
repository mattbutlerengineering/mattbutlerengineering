import { describe, it, expect } from "vitest";
import {
  eventMatchesTarget,
  classifyTargetOutcome,
  projectVerdicts,
  aggregateExitCode,
  renderJobSummary,
} from "../sentry-heartbeat.mjs";
import { TARGETS, IN_SCOPE_PROJECTS } from "../sentry-heartbeat-targets.mjs";

const MARKER = "mbe-round-trip-20261001T041130897Z-abc123";
const backend = Object.freeze({
  id: "users-api",
  kind: "backend",
  project: "users-api",
  url: "https://api.example.test/api/v1/users/health",
});
const marketing = Object.freeze({
  id: "marketing",
  kind: "browser",
  project: "mattbutlerengineering",
  url: "https://example.test/",
  app: "marketing",
});

describe("eventMatchesTarget", () => {
  it("matches a backend event on the url tag, reusing eventMatchesMarker", () => {
    const event = { tags: [{ key: "url", value: `/api/v1/users/health?rt=${MARKER}` }] };
    expect(eventMatchesTarget(event, backend, MARKER)).toBe(true);
  });

  it("does not match a backend event that lacks the marker", () => {
    const event = { title: `HTTP 429 ${MARKER}`, tags: [{ key: "url", value: "/health" }] };
    expect(eventMatchesTarget(event, backend, MARKER)).toBe(false);
  });

  it("matches a browser event whose marker is only in the title (measured live: url tag drops the query)", () => {
    const event = {
      title: `Error: ${MARKER} sentry heartbeat`,
      tags: [
        { key: "app", value: "marketing" },
        { key: "url", value: "https://example.test/" },
      ],
    };
    expect(eventMatchesTarget(event, marketing, MARKER)).toBe(true);
  });

  it("matches a browser event on the message or url tag too", () => {
    const tags = [{ key: "app", value: "marketing" }];
    expect(
      eventMatchesTarget({ message: `${MARKER} sentry heartbeat`, tags }, marketing, MARKER)
    ).toBe(true);
    expect(
      eventMatchesTarget(
        { tags: [...tags, { key: "url", value: `https://example.test/?mbe-heartbeat=${MARKER}` }] },
        marketing,
        MARKER
      )
    ).toBe(true);
  });

  it("does not match a browser event with the right marker but the wrong app tag", () => {
    const event = {
      title: `Error: ${MARKER} sentry heartbeat`,
      tags: [{ key: "app", value: "hospitality" }],
    };
    expect(eventMatchesTarget(event, marketing, MARKER)).toBe(false);
  });

  it("does not match a browser event with no app tag at all", () => {
    expect(eventMatchesTarget({ title: `Error: ${MARKER}` }, marketing, MARKER)).toBe(false);
  });

  it("tolerates malformed events", () => {
    expect(eventMatchesTarget(undefined, marketing, MARKER)).toBe(false);
    expect(eventMatchesTarget({ tags: "nope" }, backend, MARKER)).toBe(false);
  });
});

describe("classifyTargetOutcome", () => {
  const triggered = { triggered: true };

  it("is confirmed when the event was found in the expected project", () => {
    expect(classifyTargetOutcome({ triggerResult: triggered, found: { id: "e1" } })).toMatchObject({
      outcome: "confirmed",
    });
  });

  it("is error when the lookup failed — never not-found", () => {
    expect(
      classifyTargetOutcome({ triggerResult: triggered, lookupError: new Error("Sentry 500") })
    ).toMatchObject({ outcome: "error" });
  });

  it("is misrouted, naming the project, when a miss is found by the sweep elsewhere", () => {
    expect(
      classifyTargetOutcome({
        triggerResult: triggered,
        found: undefined,
        sweepHit: { project: "hospitality", event: { id: "e2" } },
      })
    ).toEqual({ outcome: "misrouted", foundInProject: "hospitality" });
  });

  it("is not-found when nothing turned up anywhere", () => {
    expect(classifyTargetOutcome({ triggerResult: triggered })).toEqual({ outcome: "not-found" });
  });

  it("is provoke-failed when the trigger never fired (SC-5)", () => {
    expect(
      classifyTargetOutcome({ triggerResult: { triggered: false, reason: "no 429" } })
    ).toEqual({ outcome: "provoke-failed" });
  });

  it("treats a missing trigger result as provoke-failed, failing closed", () => {
    expect(classifyTargetOutcome({})).toEqual({ outcome: "provoke-failed" });
  });
});

/** One outcome per registry target, all confirmed unless overridden by id. */
function outcomesWith(overrides = {}) {
  return TARGETS.map((target) => ({
    targetId: target.id,
    project: target.project,
    marker: `${MARKER}-${target.id}`,
    outcome: "confirmed",
    ...overrides[target.id],
  }));
}

describe("projectVerdicts", () => {
  it("gives every in-scope project exactly one verdict, in registry order", () => {
    const verdicts = projectVerdicts(outcomesWith(), TARGETS);
    expect(verdicts.map((verdict) => verdict.project)).toEqual([...IN_SCOPE_PROJECTS]);
    expect(verdicts.every((verdict) => verdict.pass)).toBe(true);
  });

  it("still gives a verdict for a project whose targets all errored (SC-2)", () => {
    const verdicts = projectVerdicts(
      outcomesWith({ "users-api": { outcome: "error", detail: "Sentry 500" } }),
      TARGETS
    );
    const users = verdicts.find((verdict) => verdict.project === "users-api");
    expect(users).toMatchObject({ pass: false });
    expect(users.targets).toHaveLength(1);
  });

  it("still gives a verdict for a project whose outcomes are missing entirely, failing closed", () => {
    const verdicts = projectVerdicts([], TARGETS);
    expect(verdicts).toHaveLength(IN_SCOPE_PROJECTS.length);
    expect(verdicts.every((verdict) => verdict.pass === false)).toBe(true);
    expect(verdicts[0].targets[0]).toMatchObject({ targetId: "users-api", outcome: "error" });
  });

  it("fails mattbutlerengineering when either of its two bundles is not confirmed", () => {
    for (const id of ["marketing", "rialto-web"]) {
      const verdicts = projectVerdicts(
        outcomesWith({ [id]: { outcome: "misrouted", foundInProject: "hospitality" } }),
        TARGETS
      );
      const shared = verdicts.find((verdict) => verdict.project === "mattbutlerengineering");
      expect(shared.pass).toBe(false);
      expect(shared.targets).toHaveLength(2);
    }
  });
});

describe("aggregateExitCode", () => {
  it("is 0 when every project passes", () => {
    expect(aggregateExitCode(projectVerdicts(outcomesWith(), TARGETS))).toBe(0);
  });

  it("is 1 when any project fails", () => {
    expect(
      aggregateExitCode(
        projectVerdicts(outcomesWith({ "agent-api": { outcome: "not-found" } }), TARGETS)
      )
    ).toBe(1);
  });

  it("is 2 for missing or malformed input (SC-6, fail closed)", () => {
    expect(aggregateExitCode(undefined)).toBe(2);
    expect(aggregateExitCode(null)).toBe(2);
    expect(aggregateExitCode({ pass: true })).toBe(2);
    expect(aggregateExitCode([])).toBe(2);
    expect(aggregateExitCode([{ project: "users-api" }])).toBe(2);
    expect(aggregateExitCode([{ project: "users-api", pass: "yes" }])).toBe(2);
    expect(aggregateExitCode([null])).toBe(2);
  });
});

describe("renderJobSummary", () => {
  it("is a markdown table with one row per project and each target's outcome", () => {
    const summary = renderJobSummary(
      projectVerdicts(
        outcomesWith({
          marketing: { outcome: "misrouted", foundInProject: "hospitality" },
          "rialto-web": { outcome: "misrouted", foundInProject: "hospitality" },
        }),
        TARGETS
      )
    );
    const rows = summary
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Project"));
    const dataRows = rows.filter((line) => !/^\|\s*-/.test(line));
    expect(dataRows).toHaveLength(IN_SCOPE_PROJECTS.length);
    expect(summary).toMatch(/\| Project \| Verdict \| Targets \|/);
    expect(summary).toContain("mattbutlerengineering");
    expect(summary).toContain("marketing: misrouted → hospitality");
    expect(summary).toContain("users-api: confirmed");
    expect(summary).toMatch(/mattbutlerengineering \| FAIL/);
    expect(summary).toMatch(/users-api \| PASS/);
  });
});

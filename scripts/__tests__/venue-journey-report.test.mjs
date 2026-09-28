import { describe, it, expect } from "vitest";
import {
  buildBlockedIssue,
  buildFailureIssue,
  buildFrictionEntry,
  buildJobSummary,
  buildStepSignature,
  classifyJourneyStepOutcome,
  collectFriction,
  findDuplicateIssue,
  redactSecrets,
} from "../venue-journey/report.mjs";

/** @returns {import("../venue-journey/report.mjs").JourneyReport} */
function makeReport(overrides = {}) {
  return {
    runId: "12345",
    runUrl: "https://github.com/o/r/actions/runs/12345",
    startedAt: "2026-07-30T14:00:00.000Z",
    venueName: "synthetic-journey-12345",
    steps: [
      { name: "Authenticate", status: "passed", durationMs: 1200 },
      { name: "Sweep leftover venues", status: "passed", durationMs: 800 },
      { name: "Complete Settings step", status: "passed", durationMs: 2400 },
    ],
    consoleErrors: [],
    ...overrides,
  };
}

describe("redactSecrets", () => {
  it("returns the text unchanged when it holds no secret-shaped material", () => {
    expect(redactSecrets("Timed out waiting for locator('#launch')")).toBe(
      "Timed out waiting for locator('#launch')"
    );
  });

  it("redacts JWTs so captured tokens never reach a public issue body", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdXRoMHwxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    expect(redactSecrets(`request failed with ${jwt}`)).toBe("request failed with [redacted-jwt]");
  });

  it("redacts Authorization/Bearer headers captured from network errors", () => {
    expect(redactSecrets("authorization: Bearer abc123def456")).toBe("authorization: [redacted]");
  });

  it("redacts access_token and id_token JSON fields", () => {
    expect(redactSecrets('{"access_token":"abc.def.ghi","expires_in":86400}')).toBe(
      '{"access_token":"[redacted]","expires_in":86400}'
    );
  });

  it("coerces non-string input to an empty string rather than throwing", () => {
    expect(redactSecrets(undefined)).toBe("");
  });
});

describe("buildStepSignature", () => {
  it("slugs a step name into a stable dedupe signature", () => {
    expect(buildStepSignature("Complete Settings step")).toBe(
      "venue-journey/complete-settings-step"
    );
  });

  it("collapses punctuation and repeated separators", () => {
    expect(buildStepSignature("Launch  venue — dashboard handoff!")).toBe(
      "venue-journey/launch-venue-dashboard-handoff"
    );
  });

  it("is stable across runs for the same step name", () => {
    expect(buildStepSignature("Create venue")).toBe(buildStepSignature("Create venue"));
  });
});

describe("buildFailureIssue", () => {
  it("returns null when every step passed — a green run files nothing", () => {
    expect(buildFailureIssue(makeReport())).toBeNull();
  });

  it("builds a deduped audit+ready issue for the first failing step", () => {
    const report = makeReport({
      steps: [
        { name: "Authenticate", status: "passed", durationMs: 1200 },
        {
          name: "Complete Settings step",
          status: "failed",
          durationMs: 15000,
          error: "locator.click: Timeout 15000ms exceeded",
        },
        { name: "Launch venue", status: "skipped", durationMs: 0 },
      ],
    });

    const issue = buildFailureIssue(report);

    expect(issue.title).toBe("[Journey] Venue onboarding failed at Complete Settings step");
    expect(issue.searchPhrase).toBe("venue-journey/complete-settings-step");
    expect(issue.labels).toEqual(["audit", "ready"]);
    expect(issue.body).toContain("venue-journey/complete-settings-step");
    expect(issue.body).toContain("locator.click: Timeout 15000ms exceeded");
    expect(issue.body).toContain("https://github.com/o/r/actions/runs/12345");
    expect(issue.body).toContain("venue-journey-artifacts");
  });

  it("redacts secret-shaped material out of the failure body", () => {
    const report = makeReport({
      steps: [
        {
          name: "Authenticate",
          status: "failed",
          durationMs: 900,
          error: 'POST /oauth/token → {"access_token":"abc.def.ghi"}',
        },
      ],
    });

    const issue = buildFailureIssue(report);

    expect(issue.body).not.toContain("abc.def.ghi");
    expect(issue.body).toContain("[redacted]");
  });

  it("reports the first failing step when several fail", () => {
    const report = makeReport({
      steps: [
        { name: "Authenticate", status: "failed", durationMs: 900, error: "boom" },
        { name: "Launch venue", status: "failed", durationMs: 100, error: "later" },
      ],
    });

    expect(buildFailureIssue(report).title).toBe(
      "[Journey] Venue onboarding failed at Authenticate"
    );
  });

  it("renders the captured page error above the Error block", () => {
    const report = makeReport({
      steps: [
        {
          name: "Step 5 — launch the venue",
          status: "failed",
          durationMs: 15000,
          error: "locator.click: Timeout 15000ms exceeded",
          pageError: "POST /api/v1/venues failed: 403 Admin role required",
        },
      ],
    });

    const { body } = buildFailureIssue(report);

    expect(body).toContain("### Page error");
    expect(body).toContain("POST /api/v1/venues failed: 403 Admin role required");
    expect(body.indexOf("### Page error")).toBeLessThan(body.indexOf("### Error"));
  });

  it("omits the Page error section entirely when no alert was captured", () => {
    const report = makeReport({
      steps: [{ name: "Launch venue", status: "failed", durationMs: 900, error: "boom" }],
    });

    expect(buildFailureIssue(report).body).not.toContain("### Page error");
  });

  it("omits the Page error section when the captured text was blank", () => {
    const report = makeReport({
      steps: [
        {
          name: "Launch venue",
          status: "failed",
          durationMs: 900,
          error: "boom",
          pageError: "   ",
        },
      ],
    });

    expect(buildFailureIssue(report).body).not.toContain("### Page error");
  });

  it("redacts secret-shaped material out of the captured page error", () => {
    const report = makeReport({
      steps: [
        {
          name: "Launch venue",
          status: "failed",
          durationMs: 900,
          error: "boom",
          pageError: 'Request failed: {"access_token":"abc.def.ghi"}',
        },
      ],
    });

    const { body } = buildFailureIssue(report);

    expect(body).not.toContain("abc.def.ghi");
    expect(body).toContain("### Page error");
  });

  it("builds a comment body for a duplicate that names the run", () => {
    const report = makeReport({
      steps: [{ name: "Authenticate", status: "failed", durationMs: 900, error: "boom" }],
    });

    const { commentBody } = buildFailureIssue(report);

    expect(commentBody).toContain("Recurred");
    expect(commentBody).toContain("https://github.com/o/r/actions/runs/12345");
  });

  it("carries the page error into the recurrence comment, so a new root cause is visible", () => {
    // The dedupe key is the step, not the cause: a 403 and a later 500 at the
    // same step both bump one issue. The comment is the ONLY output on that
    // path, so it has to carry the cause that changed.
    const report = makeReport({
      steps: [
        {
          name: "Step 5 — launch the venue",
          status: "failed",
          durationMs: 30000,
          error: "Timed out 30000ms waiting for expect(locator).toBeVisible()",
          pageError: "POST /api/v1/venues failed: 500 Internal Server Error",
        },
      ],
    });

    const { commentBody } = buildFailureIssue(report);

    expect(commentBody).toContain("### Page error");
    expect(commentBody).toContain("POST /api/v1/venues failed: 500 Internal Server Error");
    expect(commentBody.indexOf("### Page error")).toBeLessThan(commentBody.indexOf("### Error"));
  });

  it("omits the Page error section from the comment when no alert was captured", () => {
    const report = makeReport({
      steps: [{ name: "Launch venue", status: "failed", durationMs: 900, error: "boom" }],
    });

    expect(buildFailureIssue(report).commentBody).not.toContain("### Page error");
  });

  it("omits the Page error section from the comment when the captured text was blank", () => {
    const report = makeReport({
      steps: [
        {
          name: "Launch venue",
          status: "failed",
          durationMs: 900,
          error: "boom",
          pageError: "   ",
        },
      ],
    });

    expect(buildFailureIssue(report).commentBody).not.toContain("### Page error");
  });

  it("redacts secret-shaped material out of the page error on the comment path", () => {
    const report = makeReport({
      steps: [
        {
          name: "Launch venue",
          status: "failed",
          durationMs: 900,
          error: "boom",
          pageError: 'Request failed: {"access_token":"abc.def.ghi"}',
        },
      ],
    });

    const { commentBody } = buildFailureIssue(report);

    expect(commentBody).not.toContain("abc.def.ghi");
    expect(commentBody).toContain("### Page error");
  });
});

describe("findDuplicateIssue", () => {
  const target = {
    title: "[Journey] Venue onboarding failed at Launch venue",
    searchPhrase: "venue-journey/launch-venue",
  };

  it("returns null when no open issue matches", () => {
    const issues = [{ number: 1, title: "Something else", body: "unrelated" }];

    expect(findDuplicateIssue(issues, target)).toBeNull();
  });

  it("matches an existing issue by exact title", () => {
    const issues = [{ number: 42, title: target.title, body: "" }];

    expect(findDuplicateIssue(issues, target)).toBe(42);
  });

  it("matches a retitled issue by the signature embedded in its body", () => {
    const issues = [
      {
        number: 7,
        title: "Onboarding broken (renamed)",
        body: "Signature: venue-journey/launch-venue",
      },
    ];

    expect(findDuplicateIssue(issues, target)).toBe(7);
  });

  it("returns the lowest-numbered match so bumps always land on the original", () => {
    const issues = [
      { number: 90, title: target.title, body: "" },
      { number: 12, title: target.title, body: "" },
    ];

    expect(findDuplicateIssue(issues, target)).toBe(12);
  });

  it("tolerates a missing body on an issue", () => {
    const issues = [{ number: 3, title: "no body here" }];

    expect(findDuplicateIssue(issues, target)).toBeNull();
  });

  it("does not match a different step's signature", () => {
    const issues = [
      {
        number: 5,
        title: "[Journey] Venue onboarding failed at Authenticate",
        body: "venue-journey/authenticate",
      },
    ];

    expect(findDuplicateIssue(issues, target)).toBeNull();
  });
});

describe("collectFriction", () => {
  it("reports no friction for a fast, console-clean run", () => {
    expect(collectFriction(makeReport())).toEqual({ slowSteps: [], consoleErrors: [] });
  });

  it("flags steps slower than the 10s budget", () => {
    const report = makeReport({
      steps: [
        { name: "Authenticate", status: "passed", durationMs: 1200 },
        { name: "Launch venue", status: "passed", durationMs: 12_500 },
      ],
    });

    expect(collectFriction(report).slowSteps).toEqual([
      { name: "Launch venue", durationMs: 12_500 },
    ]);
  });

  it("ignores a slow step that already failed — that is a hard failure, not friction", () => {
    const report = makeReport({
      steps: [{ name: "Launch venue", status: "failed", durationMs: 30_000, error: "boom" }],
    });

    expect(collectFriction(report).slowSteps).toEqual([]);
  });

  it("dedupes and redacts console errors", () => {
    const report = makeReport({
      consoleErrors: [
        "Failed to load resource: 404",
        "Failed to load resource: 404",
        'token {"id_token":"a.b.c"}',
      ],
    });

    expect(collectFriction(report).consoleErrors).toEqual([
      "Failed to load resource: 404",
      'token {"id_token":"[redacted]"}',
    ]);
  });
});

describe("buildFrictionEntry", () => {
  it("returns null when the run had no friction", () => {
    expect(buildFrictionEntry(makeReport())).toBeNull();
  });

  it("writes a dated entry naming the slow steps and console errors", () => {
    const report = makeReport({
      steps: [{ name: "Launch venue", status: "passed", durationMs: 12_500 }],
      consoleErrors: ["Failed to load resource: 404"],
    });

    const entry = buildFrictionEntry(report);

    expect(entry).toContain("2026-07-30");
    expect(entry).toContain("Launch venue");
    expect(entry).toContain("12500");
    expect(entry).toContain("Failed to load resource: 404");
    expect(entry).toContain("https://github.com/o/r/actions/runs/12345");
  });
});

describe("buildJobSummary", () => {
  it("renders a per-step timings table", () => {
    const summary = buildJobSummary(makeReport());

    expect(summary).toContain("| Step | Status | Duration |");
    expect(summary).toContain("| Authenticate | passed | 1200 ms |");
    expect(summary).toContain("synthetic-journey-12345");
  });

  it("marks the run green when nothing failed and nothing was slow", () => {
    expect(buildJobSummary(makeReport())).toContain("Journey green");
  });

  it("names the failing step in the summary heading", () => {
    const report = makeReport({
      steps: [{ name: "Launch venue", status: "failed", durationMs: 900, error: "boom" }],
    });

    expect(buildJobSummary(report)).toContain("Journey failed at Launch venue");
  });

  it("redacts secrets that reached a step error", () => {
    const report = makeReport({
      steps: [
        {
          name: "Authenticate",
          status: "failed",
          durationMs: 900,
          error: "authorization: Bearer supersecret",
        },
      ],
    });

    expect(buildJobSummary(report)).not.toContain("supersecret");
  });

  it("names the blocked step in the heading and never calls the run green", () => {
    const report = makeReport({
      steps: [
        { name: "Authenticate", status: "passed", durationMs: 1200 },
        {
          name: "A non-admin identity can bootstrap its first venue",
          status: "blocked",
          durationMs: 0,
          error: "Blocked on unset credentials: E2E_NONADMIN_AUTH_EMAIL",
          missingCredentials: ["E2E_NONADMIN_AUTH_EMAIL"],
        },
      ],
    });

    const summary = buildJobSummary(report);

    expect(summary).toContain(
      "Journey blocked at A non-admin identity can bootstrap its first venue"
    );
    expect(summary).not.toContain("Journey green");
  });
});

describe("classifyJourneyStepOutcome", () => {
  const NON_ADMIN_ENV = ["E2E_NONADMIN_AUTH_EMAIL", "E2E_NONADMIN_AUTH_PASSWORD"];
  const provisioned = {
    E2E_NONADMIN_AUTH_EMAIL: "operator@example.com",
    E2E_NONADMIN_AUTH_PASSWORD: "operator-secret",
  };

  it("reports `passed` when the credentials are present and the step did not throw", () => {
    expect(
      classifyJourneyStepOutcome({ requiredEnv: NON_ADMIN_ENV, env: provisioned })
    ).toMatchObject({ state: "passed", missingCredentials: [] });
  });

  it("reports `passed` for a step that requires no credentials at all", () => {
    expect(classifyJourneyStepOutcome({}).state).toBe("passed");
  });

  it("reports `failed` when the credentials are present and the step threw", () => {
    const outcome = classifyJourneyStepOutcome({
      requiredEnv: NON_ADMIN_ENV,
      env: provisioned,
      error: "expected 201, received 403",
    });

    expect(outcome.state).toBe("failed");
    expect(outcome.reason).toContain("expected 201, received 403");
  });

  it("still reports `failed` when the step threw with an empty message", () => {
    // "" is a real throw, not the absence of one — reading it as `passed`
    // would turn a silent failure into a green step.
    expect(classifyJourneyStepOutcome({ error: "" }).state).toBe("failed");
  });

  it("reports `blocked` — never `failed` — when a required credential is unset", () => {
    const outcome = classifyJourneyStepOutcome({ requiredEnv: NON_ADMIN_ENV, env: {} });

    expect(outcome.state).toBe("blocked");
    expect(outcome.missingCredentials).toEqual(NON_ADMIN_ENV);
    expect(outcome.reason).toContain("E2E_NONADMIN_AUTH_EMAIL");
    expect(outcome.reason).toContain("E2E_NONADMIN_AUTH_PASSWORD");
  });

  it("names only the credential that is actually missing", () => {
    const outcome = classifyJourneyStepOutcome({
      requiredEnv: NON_ADMIN_ENV,
      env: { E2E_NONADMIN_AUTH_EMAIL: "operator@example.com" },
    });

    expect(outcome.missingCredentials).toEqual(["E2E_NONADMIN_AUTH_PASSWORD"]);
  });

  it("treats an empty-string credential as unset", () => {
    // `gh secret set NAME` with no `--body` reads empty stdin and stores "",
    // which is indistinguishable from never having been set.
    const outcome = classifyJourneyStepOutcome({
      requiredEnv: NON_ADMIN_ENV,
      env: { ...provisioned, E2E_NONADMIN_AUTH_PASSWORD: "" },
    });

    expect(outcome.state).toBe("blocked");
  });

  it("prefers `blocked` over `failed` when the unset credential is what made the step throw", () => {
    const outcome = classifyJourneyStepOutcome({
      requiredEnv: NON_ADMIN_ENV,
      env: {},
      error: "Missing required non-admin journey env vars: E2E_NONADMIN_AUTH_EMAIL",
    });

    expect(outcome.state).toBe("blocked");
  });

  it("fails closed when no environment is supplied rather than assuming provisioned", () => {
    expect(classifyJourneyStepOutcome({ requiredEnv: NON_ADMIN_ENV }).state).toBe("blocked");
  });

  it("never throws on an unexpected input shape", () => {
    expect(() => classifyJourneyStepOutcome()).not.toThrow();
    expect(classifyJourneyStepOutcome({ requiredEnv: "nope", env: null }).state).toBe("passed");
  });
});

describe("buildBlockedIssue", () => {
  /** @returns {import("../venue-journey/report.mjs").JourneyReport} */
  function blockedReport() {
    return makeReport({
      steps: [
        { name: "Authenticate", status: "passed", durationMs: 1200 },
        {
          name: "A non-admin identity can bootstrap its first venue",
          status: "blocked",
          durationMs: 0,
          error: "Blocked on unset credentials: E2E_NONADMIN_AUTH_EMAIL",
          missingCredentials: ["E2E_NONADMIN_AUTH_EMAIL", "E2E_NONADMIN_AUTH_PASSWORD"],
        },
      ],
    });
  }

  it("returns null when no step was blocked", () => {
    expect(buildBlockedIssue(makeReport())).toBeNull();
  });

  it("says blocked, not failed, in the title", () => {
    expect(buildBlockedIssue(blockedReport()).title).toBe(
      "[Journey] Venue onboarding blocked at A non-admin identity can bootstrap its first venue"
    );
  });

  it("states it is blocked on an unset credential and names which", () => {
    const { body } = buildBlockedIssue(blockedReport());

    expect(body).toContain("blocked on an unset credential");
    expect(body).toContain("E2E_NONADMIN_AUTH_EMAIL");
    expect(body).toContain("E2E_NONADMIN_AUTH_PASSWORD");
    expect(body).not.toContain("journey failed at");
  });

  it("names the exact remediation, always with --body", () => {
    const { body } = buildBlockedIssue(blockedReport());

    expect(body).toContain('gh secret set E2E_NONADMIN_AUTH_EMAIL --body "<value>"');
    expect(body).toContain('gh secret set E2E_NONADMIN_AUTH_PASSWORD --body "<value>"');
  });

  it("warns that omitting --body silently stores an empty secret", () => {
    const { body } = buildBlockedIssue(blockedReport());

    expect(body).toContain("--body");
    expect(body).toContain("empty");
  });

  it("is not agent-actionable — labelled for a human, never `ready`", () => {
    expect(buildBlockedIssue(blockedReport()).labels).toEqual(["audit", "ready-for-human"]);
  });

  it("dedupes on the same step signature a failure at that step would use", () => {
    const issue = buildBlockedIssue(blockedReport());

    expect(issue.searchPhrase).toBe(
      "venue-journey/a-non-admin-identity-can-bootstrap-its-first-venue"
    );
    expect(issue.body).toContain(issue.searchPhrase);
  });

  it("carries the step timings so the blocked step is visible in context", () => {
    const { body } = buildBlockedIssue(blockedReport());

    expect(body).toContain("| Authenticate | passed | 1200 ms |");
    expect(body).toContain(
      "| A non-admin identity can bootstrap its first venue | blocked | 0 ms |"
    );
  });

  it("builds a recurrence comment that still reads as blocked", () => {
    const { commentBody } = buildBlockedIssue(blockedReport());

    expect(commentBody).toContain("Still blocked");
    expect(commentBody).toContain("https://github.com/o/r/actions/runs/12345");
    expect(commentBody).toContain("E2E_NONADMIN_AUTH_EMAIL");
  });

  it("redacts secret-shaped material out of the blocked body", () => {
    const report = makeReport({
      steps: [
        {
          name: "Bootstrap",
          status: "blocked",
          durationMs: 0,
          error: 'leaked {"password":"hunter2"}',
          missingCredentials: ["E2E_NONADMIN_AUTH_PASSWORD"],
        },
      ],
    });

    expect(buildBlockedIssue(report).body).not.toContain("hunter2");
  });
});

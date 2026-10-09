import { describe, it, expect, vi } from "vitest";
import {
  ALERT_LABEL,
  alertMarker,
  projectFromIssueBody,
  decideIssueActions,
  reconcileIssues,
} from "../sentry-heartbeat-issues.mjs";

const RUN_URL = "https://github.com/o/r/actions/runs/123";

const passing = (project) => ({
  project,
  pass: true,
  targets: [{ targetId: project, project, outcome: "confirmed" }],
});
const sharedFailing = {
  project: "mattbutlerengineering",
  pass: false,
  targets: [
    {
      targetId: "marketing",
      project: "mattbutlerengineering",
      outcome: "misrouted",
      foundInProject: "hospitality",
    },
    {
      targetId: "rialto-web",
      project: "mattbutlerengineering",
      outcome: "misrouted",
      foundInProject: "hospitality",
    },
  ],
};
const openIssue = (number, project) => ({ number, body: `Some text\n\n${alertMarker(project)}\n` });

describe("alert marker", () => {
  it("round-trips a project slug through an issue body", () => {
    expect(projectFromIssueBody(`hello\n${alertMarker("users-api")}`)).toBe("users-api");
    expect(projectFromIssueBody("a triage issue about sentry.io/issues/1")).toBeUndefined();
    expect(projectFromIssueBody(undefined)).toBeUndefined();
  });
});

describe("decideIssueActions", () => {
  it("opens one issue for a failing project with no open alert, labelled sentry only (SC-7)", () => {
    const [action] = decideIssueActions([sharedFailing], [], RUN_URL);
    expect(action).toMatchObject({
      project: "mattbutlerengineering",
      action: "open",
      labels: [ALERT_LABEL],
    });
    expect(action.labels).toEqual(["sentry"]);
    expect(action.title).toContain("mattbutlerengineering");
    expect(action.body).toContain("mattbutlerengineering");
    expect(action.body).toContain("marketing: misrouted → hospitality");
    expect(action.body).toContain("rialto-web: misrouted → hospitality");
    expect(action.body).toContain(RUN_URL);
    expect(action.body).toContain(alertMarker("mattbutlerengineering"));
  });

  it("comments, and never opens, when the failing project already has an open alert (SC-7)", () => {
    const actions = decideIssueActions(
      [sharedFailing],
      [openIssue(42, "mattbutlerengineering")],
      RUN_URL
    );
    expect(actions).toEqual([
      expect.objectContaining({
        project: "mattbutlerengineering",
        action: "comment",
        issueNumber: 42,
      }),
    ]);
    expect(actions[0].body).toContain(RUN_URL);
  });

  it("closes an open alert with a comment linking the green run (SC-8)", () => {
    const [action] = decideIssueActions(
      [passing("users-api")],
      [openIssue(7, "users-api")],
      RUN_URL
    );
    expect(action).toMatchObject({ project: "users-api", action: "close", issueNumber: 7 });
    expect(action.body).toContain(RUN_URL);
  });

  it("does nothing for a passing project with no open alert (SC-8)", () => {
    expect(decideIssueActions([passing("users-api")], [], RUN_URL)).toEqual([
      { project: "users-api", action: "none" },
    ]);
  });

  it("ignores open sentry issues that are not heartbeat alerts", () => {
    const triageIssue = {
      number: 9,
      body: "Sentry issue https://mattbutlerengineering.sentry.io/issues/123/",
    };
    const [action] = decideIssueActions([sharedFailing], [triageIssue], RUN_URL);
    expect(action.action).toBe("open");
  });

  it("never writes a Sentry issue link, so triage dedup can't be fooled", () => {
    const actions = decideIssueActions(
      [sharedFailing, passing("users-api")],
      [openIssue(7, "users-api")],
      RUN_URL
    );
    for (const action of actions) {
      expect(`${action.title ?? ""}\n${action.body ?? ""}`).not.toMatch(
        /sentry\.io\/.*\/issues\/\d+/
      );
    }
  });
});

/** A fake GitHub adapter recording every call. */
function fakeGitHub({ openIssues = [], failOn } = {}) {
  const calls = [];
  const maybeFail = (name) => {
    if (failOn === name) throw new Error(`${name} failed`);
  };
  return {
    calls,
    listOpenAlertIssues: vi.fn(async () => {
      maybeFail("list");
      return openIssues;
    }),
    createIssue: vi.fn(async (issue) => {
      maybeFail("create");
      calls.push(["create", issue.title]);
    }),
    comment: vi.fn(async (number) => {
      maybeFail("comment");
      calls.push(["comment", number]);
    }),
    close: vi.fn(async (number) => {
      calls.push(["close", number]);
    }),
  };
}

describe("reconcileIssues", () => {
  it("takes no action and fails when the open-issue list cannot be read", async () => {
    const github = fakeGitHub({ failOn: "list" });
    const result = await reconcileIssues({ verdicts: [sharedFailing], github, runUrl: RUN_URL });
    expect(result.exitCode).not.toBe(0);
    expect(github.createIssue).not.toHaveBeenCalled();
    expect(github.comment).not.toHaveBeenCalled();
  });

  it("applies every action independently — one failure does not stop the others", async () => {
    const github = fakeGitHub({ openIssues: [openIssue(7, "users-api")], failOn: "create" });
    const result = await reconcileIssues({
      verdicts: [sharedFailing, passing("users-api")],
      github,
      runUrl: RUN_URL,
    });
    expect(github.createIssue).toHaveBeenCalledTimes(1);
    expect(github.comment).toHaveBeenCalledWith(7, expect.stringContaining(RUN_URL));
    expect(github.close).toHaveBeenCalledWith(7);
    expect(result.exitCode).toBe(1);
  });

  it("exits 0 when every action succeeded", async () => {
    const github = fakeGitHub();
    const result = await reconcileIssues({ verdicts: [sharedFailing], github, runUrl: RUN_URL });
    expect(result.exitCode).toBe(0);
    expect(github.calls).toEqual([["create", expect.stringContaining("mattbutlerengineering")]]);
  });

  it("refuses to act on unreadable verdicts (exit 2)", async () => {
    const github = fakeGitHub();
    for (const verdicts of [undefined, {}, [{ pass: true }]]) {
      const result = await reconcileIssues({ verdicts, github, runUrl: RUN_URL });
      expect(result.exitCode).toBe(2);
    }
    expect(github.listOpenAlertIssues).not.toHaveBeenCalled();
  });
});

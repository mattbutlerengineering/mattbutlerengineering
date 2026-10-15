import { describe, it, expect, vi } from "vitest";
import { fileIssue, issueState, parseIssueNumberFromUrl } from "../lib/issue-filing.mjs";

/** Minimal request shared across tests — only dedupeKey varies where needed. */
function request(overrides = {}) {
  return {
    title: "Example finding",
    body: "Something worth tracking.",
    labels: ["ready"],
    dedupeKey: "example-key",
    ...overrides,
  };
}

/** Fake deps — every call is a vi.fn() so tests can assert on invocation. */
function fakeDeps(overrides = {}) {
  return {
    getIssueState: vi.fn(() => "missing"),
    createIssue: vi.fn(() => 101),
    reopenIssue: vi.fn(),
    ...overrides,
  };
}

describe("fileIssue: skip/create/reopen decision", () => {
  it("creates a new issue when the dedupe key has no ledger entry", () => {
    const deps = fakeDeps();
    const result = fileIssue(request(), {}, deps);

    expect(result.action).toBe("create");
    expect(result.issueNumber).toBe(101);
    expect(result.ledger).toEqual({ "example-key": 101 });
    expect(deps.createIssue).toHaveBeenCalledWith("Example finding", "Something worth tracking.", [
      "ready",
    ]);
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("skips when the ledger's prior issue is still open", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "open") });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("skip");
    expect(result.issueNumber).toBe(42);
    expect(result.ledger).toEqual({ "example-key": 42 });
    expect(deps.createIssue).not.toHaveBeenCalled();
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("reopens the prior issue when it exists but is closed", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "closed") });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("reopen");
    expect(result.issueNumber).toBe(42);
    expect(result.ledger).toEqual({ "example-key": 42 });
    expect(deps.reopenIssue).toHaveBeenCalledWith(42);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("creates a fresh issue when the prior issue number no longer exists", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "missing"), createIssue: vi.fn(() => 99) });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("create");
    expect(result.issueNumber).toBe(99);
    expect(result.ledger).toEqual({ "example-key": 99 });
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("never mutates the ledger passed in", () => {
    const deps = fakeDeps();
    const original = { "example-key": 42 };
    const originalCopy = { ...original };
    deps.getIssueState = vi.fn(() => "open");

    fileIssue(request(), original, deps);

    expect(original).toEqual(originalCopy);
  });
});

describe("fileIssue: Owner veto (closed as not planned)", () => {
  it("skips a vetoed issue without reopening or creating", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "vetoed") });
    const result = fileIssue(request(), { "example-key": 77 }, deps);

    expect(result).toEqual({
      action: "skip-vetoed",
      issueNumber: 77,
      ledger: { "example-key": 77 },
    });
    expect(deps.createIssue).not.toHaveBeenCalled();
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });
});

describe("fileIssue: state lookup error (#6374)", () => {
  it("never creates or reopens when the state lookup errors", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = fakeDeps({ getIssueState: vi.fn(() => "error") });
    const result = fileIssue(request(), { "example-key": 55 }, deps);

    expect(result).toEqual({
      action: "skipped-error",
      issueNumber: 55,
      ledger: { "example-key": 55 },
    });
    expect(deps.createIssue).not.toHaveBeenCalled();
    expect(deps.reopenIssue).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("issueState", () => {
  const clientReturning = (impl) => ({ issue: { view: vi.fn(impl) } });
  const throwing = (message) =>
    clientReturning(() => {
      throw new Error(message);
    });

  it("returns error, not missing, when gh throws a transient error", () => {
    expect(issueState(throwing("connection reset by peer"), 7)).toBe("error");
  });

  it("returns missing only when gh says the issue does not exist", () => {
    expect(
      issueState(
        throwing("GraphQL: Could not resolve to an issue or pull request with the number of 7"),
        7
      )
    ).toBe("missing");
  });

  it("maps open and closed states", () => {
    expect(
      issueState(
        clientReturning(() => ({ state: "OPEN" })),
        1
      )
    ).toBe("open");
    expect(
      issueState(
        clientReturning(() => ({ state: "CLOSED" })),
        1
      )
    ).toBe("closed");
  });

  it("returns error for an unrecognised state payload", () => {
    expect(
      issueState(
        clientReturning(() => ({ state: undefined })),
        1
      )
    ).toBe("error");
  });
});

describe("parseIssueNumberFromUrl", () => {
  it("parses the trailing issue number", () => {
    expect(parseIssueNumberFromUrl("https://github.com/o/r/issues/42\n")).toBe(42);
  });

  it("throws on unexpected output", () => {
    expect(() => parseIssueNumberFromUrl("nope")).toThrow(/unexpected output/);
  });
});

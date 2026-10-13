import { describe, it, expect, vi } from "vitest";
import { fileIssueBySearch, fileIssueViaGhClient, ghIssueDeps } from "../lib/issue-filing.mjs";

/**
 * In-memory GitHub: just enough of the gh-client `issue` surface for the
 * search -> state -> create/reopen path. Mutations are recorded in `calls`.
 */
function createFakeGithub(seed = [], { failList = false, failView = false } = {}) {
  const issues = seed.map((i) => ({ state: "open", body: "", labels: [], ...i }));
  const calls = { create: [], reopen: [], list: [] };
  let next = Math.max(0, ...issues.map((i) => i.number)) + 1;
  const ghClient = {
    issue: {
      list(args) {
        calls.list.push(args);
        if (failList) throw new Error("gh: network blip");
        const flag = (name) => {
          const idx = args.indexOf(name);
          return idx === -1 ? undefined : args[idx + 1];
        };
        const label = flag("--label");
        const state = flag("--state") ?? "open";
        return issues
          .filter((i) => state === "all" || i.state === state)
          .filter((i) => label === undefined || i.labels.includes(label))
          .map(({ number, title, body, state: s }) => ({ number, title, body, state: s }));
      },
      view(n) {
        if (failView) throw new Error("gh: network blip");
        const found = issues.find((i) => i.number === n);
        if (!found) throw new Error("Could not resolve to an issue");
        return { state: found.state.toUpperCase() };
      },
      create(args) {
        const flagAll = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
        const issue = {
          number: next++,
          title: flagAll("--title")[0],
          body: flagAll("--body")[0],
          labels: flagAll("--label").flatMap((l) => l.split(",")),
          state: "open",
        };
        issues.push(issue);
        calls.create.push(issue);
        return `https://github.com/o/r/issues/${issue.number}`;
      },
      reopen(n) {
        calls.reopen.push(n);
        issues.find((i) => i.number === n).state = "open";
      },
    },
  };
  return { ghClient, calls, issues };
}

const request = { title: "T: one", body: "B", labels: ["audit"], dedupeKey: "k" };
const spec = {
  listArgs: ["--state", "all", "--json", "number,title"],
  match: (issue) => issue.title.startsWith("T:"),
};

describe("fileIssueViaGhClient: search -> state -> create/reopen", () => {
  it.each([
    ["no prior", [], "create"],
    ["prior open", [{ number: 5, title: "T: old", state: "open" }], "skip"],
    ["prior closed", [{ number: 5, title: "T: old", state: "closed" }], "reopen"],
    ["non-matching issue only", [{ number: 5, title: "Other", state: "open" }], "create"],
  ])("%s -> %s", (_name, seed, action) => {
    const { ghClient, calls } = createFakeGithub(seed);
    const result = fileIssueViaGhClient(ghClient, request, spec);
    expect(result.action).toBe(action);
    expect(calls.create).toHaveLength(action === "create" ? 1 : 0);
    expect(calls.reopen).toHaveLength(action === "reopen" ? 1 : 0);
  });

  it("returns the matched prior candidate so callers can read its title", () => {
    const { ghClient } = createFakeGithub([{ number: 5, title: "T: old", state: "open" }]);
    const result = fileIssueViaGhClient(ghClient, request, spec);
    expect(result.prior).toMatchObject({ number: 5, title: "T: old" });
    expect(result.issueNumber).toBe(5);
  });

  it("a second run after create dedupes against the issue it just filed", () => {
    const { ghClient } = createFakeGithub();
    expect(fileIssueViaGhClient(ghClient, request, spec).action).toBe("create");
    expect(fileIssueViaGhClient(ghClient, request, spec).action).toBe("skip");
  });

  it("a failed search fails open: files the issue and reports via onSearchError", () => {
    const { ghClient, calls } = createFakeGithub([], { failList: true });
    const onSearchError = vi.fn();
    const result = fileIssueViaGhClient(ghClient, request, { ...spec, onSearchError });
    expect(result.action).toBe("create");
    expect(calls.create).toHaveLength(1);
    expect(onSearchError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "gh: network blip" })
    );
  });

  it("a state-read error never creates or reopens", () => {
    const seed = [{ number: 5, title: "T: old", state: "closed" }];
    const { ghClient, calls } = createFakeGithub(seed, { failView: true });
    const result = fileIssueViaGhClient(ghClient, request, spec);
    expect(result.action).toBe("skipped-error");
    expect(calls.create).toHaveLength(0);
    expect(calls.reopen).toHaveLength(0);
  });

  it("passes the spec's list args straight to issue.list", () => {
    const { ghClient, calls } = createFakeGithub();
    fileIssueViaGhClient(ghClient, request, spec);
    expect(calls.list).toEqual([spec.listArgs]);
  });

  it("creates with title, body and one --label per label", () => {
    const { ghClient, calls } = createFakeGithub();
    fileIssueViaGhClient(ghClient, { ...request, labels: ["a", "b"] }, spec);
    expect(calls.create[0]).toMatchObject({ title: "T: one", body: "B", labels: ["a", "b"] });
  });
});

describe("fileIssueBySearch: injected deps (no gh-client)", () => {
  it("uses the supplied search/match and deps", () => {
    const deps = {
      getIssueState: vi.fn(() => "closed"),
      createIssue: vi.fn(),
      reopenIssue: vi.fn(),
    };
    const result = fileIssueBySearch(
      request,
      { search: () => [{ number: 9, title: "x" }], match: (i) => i.number === 9 },
      deps
    );
    expect(result).toMatchObject({ action: "reopen", issueNumber: 9 });
    expect(deps.reopenIssue).toHaveBeenCalledWith(9);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("tolerates a search that returns a non-array", () => {
    const deps = { getIssueState: vi.fn(), createIssue: vi.fn(() => 3), reopenIssue: vi.fn() };
    const result = fileIssueBySearch(request, { search: () => undefined, match: () => true }, deps);
    expect(result).toMatchObject({ action: "create", issueNumber: 3 });
  });
});

describe("ghIssueDeps", () => {
  it("createIssue parses the issue number out of gh's URL", () => {
    const { ghClient } = createFakeGithub();
    expect(ghIssueDeps(ghClient).createIssue("t", "b", ["x"])).toBe(1);
  });
});

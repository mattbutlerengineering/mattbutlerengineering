import { describe, it, expect } from "vitest";
import { createGhClient } from "@mbe/gh-client";
import type { ExecRunner, GhClientOptions } from "@mbe/gh-client";
import { fetchIssueForRouting } from "../commands/agent/check-model.js";

type SyncHttp = NonNullable<GhClientOptions["http"]>;

// ── fetchIssueForRouting: same-path parity + REST fallback (#4047) ────────

describe("fetchIssueForRouting", () => {
  it("uses the exec (gh CLI) path unchanged when gh is available", () => {
    const raw = {
      title: "fix: something",
      body: "issue body",
      labels: [{ name: "ready" }, { name: "ci-fix" }],
    };
    const runner: ExecRunner = () => JSON.stringify(raw);
    const client = createGhClient({ probe: () => true, runner });

    const result = fetchIssueForRouting("42", client);

    expect(result).toEqual({
      title: "fix: something",
      body: "issue body",
      labels: ["ready", "ci-fix"],
    });
  });

  it("falls back to REST when gh is absent, resolving a real issue via HTTP", () => {
    const http: SyncHttp = () => ({
      status: 200,
      body: JSON.stringify({
        number: 42,
        title: "fix: something",
        body: "issue body",
        labels: [{ name: "ready" }],
      }),
    });
    const client = createGhClient({
      probe: () => false,
      http,
      token: "gho_test",
      owner: "owner",
      repoName: "repo",
    });

    const result = fetchIssueForRouting("42", client);

    expect(result).toEqual({
      title: "fix: something",
      body: "issue body",
      labels: ["ready"],
    });
  });

  it("throws a typed, named error (not a raw spawn ENOENT) when gh is absent and no token is set", () => {
    const client = createGhClient({ probe: () => false, env: {} });

    expect(() => fetchIssueForRouting("42", client)).toThrow(/GITHUB_TOKEN/);
  });
});

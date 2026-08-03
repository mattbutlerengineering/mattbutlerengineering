import { describe, it, expect, vi } from "vitest";
import { parseRepoSlug, resolveRepoSlug } from "./repo-resolver.js";

describe("parseRepoSlug", () => {
  it("parses an HTTPS remote URL", () => {
    expect(
      parseRepoSlug("https://github.com/mattbutlerengineering/mattbutlerengineering.git")
    ).toEqual({ owner: "mattbutlerengineering", repo: "mattbutlerengineering" });
  });

  it("parses an SSH remote URL", () => {
    expect(parseRepoSlug("git@github.com:mattbutlerengineering/mattbutlerengineering.git")).toEqual(
      {
        owner: "mattbutlerengineering",
        repo: "mattbutlerengineering",
      }
    );
  });

  it("parses a URL with no trailing .git", () => {
    expect(parseRepoSlug("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns null for a non-github remote", () => {
    expect(parseRepoSlug("https://gitlab.com/owner/repo.git")).toBeNull();
  });
});

describe("resolveRepoSlug", () => {
  it("prefers GITHUB_REPOSITORY when set", () => {
    const exec = vi.fn();
    const result = resolveRepoSlug({ env: { GITHUB_REPOSITORY: "owner/repo" }, exec });
    expect(result).toEqual({ owner: "owner", repo: "repo" });
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to git remote origin when env var is absent", () => {
    const exec = vi.fn().mockReturnValue("git@github.com:owner/repo.git");
    const result = resolveRepoSlug({ env: {}, exec });
    expect(result).toEqual({ owner: "owner", repo: "repo" });
    expect(exec).toHaveBeenCalledWith("git", ["remote", "get-url", "origin"]);
  });

  it("throws a clear error when neither source resolves", () => {
    const exec = vi.fn().mockReturnValue("https://gitlab.com/owner/repo.git");
    expect(() => resolveRepoSlug({ env: {}, exec })).toThrow(/could not determine the GitHub repo/);
  });
});

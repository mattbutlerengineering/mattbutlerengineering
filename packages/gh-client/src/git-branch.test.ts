import { describe, it, expect, vi } from "vitest";
import { currentBranch } from "./git-branch.js";

describe("currentBranch", () => {
  it("trims the injected exec output", () => {
    const exec = vi.fn().mockReturnValue("fix/my-branch\n");
    expect(currentBranch(exec)).toBe("fix/my-branch");
    expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  });
});

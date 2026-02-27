import { describe, it, expect } from "vitest";
import { buildPrTitle, buildPrBody } from "../pr-creator.js";

describe("buildPrTitle", () => {
  it("creates a title with feat prefix", () => {
    const title = buildPrTitle("Add user authentication");
    expect(title).toBe("feat: Add user authentication");
  });

  it("truncates long descriptions", () => {
    const longDesc =
      "This is a very long task description that should be truncated because it exceeds the maximum allowed length for PR titles";
    const title = buildPrTitle(longDesc);
    expect(title.length).toBeLessThanOrEqual(66); // "feat: " + 60
    expect(title).toContain("...");
  });

  it("keeps short descriptions as-is", () => {
    const title = buildPrTitle("Fix typo");
    expect(title).toBe("feat: Fix typo");
  });
});

describe("buildPrBody", () => {
  it("includes task description", () => {
    const body = buildPrBody("Fix the bug", "session-123", 0.5, 10);
    expect(body).toContain("Fix the bug");
  });

  it("includes session metadata", () => {
    const body = buildPrBody("Fix the bug", "session-123", 0.5432, 10);
    expect(body).toContain("session-123");
    expect(body).toContain("$0.5432");
    expect(body).toContain("10");
  });

  it("includes test plan checklist", () => {
    const body = buildPrBody("Fix", "id", 0, 0);
    expect(body).toContain("- [ ] Review generated changes");
    expect(body).toContain("- [ ] Run CI pipeline");
    expect(body).toContain("- [ ] Verify no security issues");
  });

  it("includes agent attribution", () => {
    const body = buildPrBody("Fix", "id", 0, 0);
    expect(body).toContain("@mbe/agent-core");
  });
});

import { describe, test, expect } from "vitest";

describe("zoneForPaths", () => {
  test("derives apps/<x> zone from a changed path", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths(["apps/hospitality/src/foo.ts"])).toBe("apps/hospitality");
  });

  test("derives packages/<x> and services/<x> zones", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths(["packages/rialto/src/Button.tsx"])).toBe("packages/rialto");
    expect(zoneForPaths(["services/reservations/src/app.ts"])).toBe("services/reservations");
  });

  test("maps top-level / non-workspace files to the 'root' zone", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths(["package.json"])).toBe("root");
    expect(zoneForPaths(["docs/architecture/x.md", "scripts/foo.mjs"])).toBe("root");
  });

  test("returns null (→ global lock) when files span multiple zones", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths(["apps/hospitality/src/a.ts", "packages/rialto/src/b.ts"])).toBeNull();
  });

  // #4079: .github is large/active enough (CI, automation workflows) to
  // deserve its own zone rather than collapsing into the shared "root"
  // bucket alongside every other non-workspace path (docs/, scripts/, ...).
  test("derives .github/<x> zone from a changed path (#4079)", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths([".github/workflows/ci.yml"])).toBe(".github/workflows");
  });

  test(".claude paths still fall back to the shared 'root' zone (#4079)", async () => {
    // Unlike .github, .claude is NOT split into its own zone: .claude/skills/**
    // is genuinely cross-cutting (every skill lives under one directory), so
    // giving it a real zone would misrepresent same-zone collisions as safe.
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths([".claude/rules/gotchas.md"])).toBe("root");
  });

  test("returns null for an empty changeset", async () => {
    const { zoneForPaths } = await import("../zone-vocabulary.mjs");
    expect(zoneForPaths([])).toBeNull();
  });
});

// ── frontend-tree predicate ──────────────────────────────────────────────
// A DIFFERENT question from zoneForPath: "which workspace zone owns this
// path" vs. "is this path front-end code". Every apps/packages/services
// path has a zone, but only apps/** and packages/rialto/** are frontend.

describe("isFrontendPath", () => {
  test("apps/** paths are frontend", async () => {
    const { isFrontendPath } = await import("../zone-vocabulary.mjs");
    expect(isFrontendPath("apps/hospitality/src/App.tsx")).toBe(true);
  });

  test("packages/rialto/** paths are frontend", async () => {
    const { isFrontendPath } = await import("../zone-vocabulary.mjs");
    expect(isFrontendPath("packages/rialto/src/Button.tsx")).toBe(true);
  });

  test("other packages/** paths are NOT frontend", async () => {
    const { isFrontendPath } = await import("../zone-vocabulary.mjs");
    expect(isFrontendPath("packages/api-client/src/index.ts")).toBe(false);
  });

  test("services/** paths are NOT frontend", async () => {
    const { isFrontendPath } = await import("../zone-vocabulary.mjs");
    expect(isFrontendPath("services/reservations/src/app.ts")).toBe(false);
  });
});

describe("zoneForPath vs isFrontendPath — genuinely different questions", () => {
  test("a path can own a real (non-root) zone without being a frontend path", async () => {
    const { zoneForPath, isFrontendPath } = await import("../zone-vocabulary.mjs");
    const filePath = "services/reservations/src/app.ts";

    // Has a real, non-root zone...
    expect(zoneForPath(filePath)).toBe("services/reservations");
    // ...yet is not a frontend path. If these two predicates were ever
    // merged into one (e.g. "isFrontendPath = zoneForPath(p) !== 'root'"),
    // this path would flip to `true` and this assertion would fail.
    expect(isFrontendPath(filePath)).toBe(false);
  });
});

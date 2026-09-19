import { describe, it, expect } from "vitest";
import { findScopedPackageRoot } from "./token-count.config";

describe("findScopedPackageRoot", () => {
  it("returns the first search path that contains the package's package.json", () => {
    const fileExists = (p: string) => p === "/repo/packages/rialto/package.json";
    const root = findScopedPackageRoot(
      ["/repo/apps/rialto-web/node_modules", "/repo/node_modules"],
      "@mattbutlerengineering/rialto",
      // /repo/node_modules/@mattbutlerengineering/rialto is the pnpm symlink target
      (p) => p === "/repo/node_modules/@mattbutlerengineering/rialto/package.json" || fileExists(p)
    );
    expect(root).toBe("/repo/node_modules/@mattbutlerengineering/rialto");
  });

  it("returns undefined when no search path contains the package", () => {
    const root = findScopedPackageRoot(
      ["/repo/apps/rialto-web/node_modules", "/repo/node_modules"],
      "@mattbutlerengineering/rialto",
      () => false
    );
    expect(root).toBeUndefined();
  });
});

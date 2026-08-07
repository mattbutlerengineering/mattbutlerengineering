import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for #3913: cli-adapter-base.ts → run-cli-adapter-session.ts
 * → cli-adapter-base.ts formed a `no-circular` cycle (harmless at runtime —
 * the back-edge was `import type` — but it kept the dep-cruiser known-violations
 * baseline alive). run-cli-adapter-session.ts should depend on the narrow
 * CliAdapterContract interface, never on the concrete CliAdapterBase class.
 */
describe("run-cli-adapter-session.ts import boundary", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../run-cli-adapter-session.ts"),
    "utf-8"
  );

  it("does not import from cli-adapter-base.ts", () => {
    expect(source).not.toContain("cli-adapter-base.js");
    expect(source).not.toContain("cli-adapter-base.ts");
  });

  it("imports CliAdapterContract from cli-adapter-contract.ts", () => {
    expect(source).toContain("cli-adapter-contract.js");
  });
});

import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import baseConfig from "./base.js";

/**
 * Lint a snippet through the actual shared base config and return only the
 * messages emitted by the Node-20 API floor guardrail (`no-restricted-properties`).
 */
async function lintForNodeFloor(code: string): Promise<string[]> {
  const eslint = new ESLint({
    // Use only the shared base config — do not discover an on-disk config file.
    overrideConfigFile: true,
    overrideConfig: baseConfig,
  });
  const [result] = await eslint.lintText(code, { filePath: "sample.ts" });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-properties")
    .map((message) => message.message);
}

describe("shared base ESLint config — Node-20 API floor guardrail", () => {
  it("flags Promise.withResolvers with a message referencing the Node 20 floor", async () => {
    const messages = await lintForNodeFloor(
      "const { promise, resolve } = Promise.withResolvers();\n"
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/Promise\.withResolvers/);
    expect(messages[0]).toMatch(/Node 20/);
    expect(messages[0]).toMatch(/engines/);
  });

  it("passes the Node-20-safe new Promise(...) equivalent", async () => {
    const messages = await lintForNodeFloor(
      ["let resolve;", "const promise = new Promise((res) => {", "  resolve = res;", "});"].join(
        "\n"
      ) + "\n"
    );

    expect(messages).toEqual([]);
  });

  it("also flags the other banned Node-21/22-only statics", async () => {
    const cases = [
      "Array.fromAsync(gen());",
      "Object.groupBy(items, (x) => x.key);",
      "Map.groupBy(items, (x) => x.key);",
    ];

    for (const code of cases) {
      const messages = await lintForNodeFloor(code);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/Node (20|21|22)/);
    }
  });

  it("does not flag unrelated static method calls", async () => {
    const messages = await lintForNodeFloor(
      "const values = Array.from(new Set([1, 2, 3]));\nObject.keys({ a: 1 });\n"
    );

    expect(messages).toEqual([]);
  });
});

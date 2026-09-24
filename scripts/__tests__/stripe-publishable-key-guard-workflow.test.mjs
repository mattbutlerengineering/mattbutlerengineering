import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * Name shared by both workflows' guard step — kept identical on purpose so a
 * future reader sees the same title in both jobs and knows it's one contract.
 */
const GUARD_STEP_NAME = "Validate VITE_STRIPE_PUBLISHABLE_KEY is a publishable key";

/**
 * Split the workflow into step blocks.
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * deploy-static-sentry-env.test.mjs / pulumi-cli-pin.test.mjs. A step begins
 * at a `- name:` / `- run:` / `- uses:` list item and runs until the next
 * one, so a step's own `env:`/`run:` block travels with it regardless of
 * field order.
 */
function stepBlocks(yaml) {
  const lines = yaml.split("\n");
  const starts = lines.reduce((acc, line, index) => {
    if (/^\s*-\s+(name|run|uses):/.test(line)) acc.push(index);
    return acc;
  }, []);

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

/**
 * Two secret-mistake incidents in this issue's history: (1) the secret was
 * absent entirely, and (2) a live SECRET key (sk_...) was briefly stored
 * under the publishable-key name, which would have bundled a live secret
 * into public JS. The guard exists to fail loudly on case (2) — this table
 * is the fixture the real workflow's `run:` block is executed against.
 */
const CASES = [
  { label: "empty (secret unset)", value: "", shouldExit: 0 },
  { label: "a test-mode publishable key", value: "pk_test_abc123", shouldExit: 0 },
  { label: "a live-mode publishable key", value: "pk_live_abc123", shouldExit: 0 },
  {
    label: "a live-mode SECRET key (the incident this guards against)",
    value: "sk_live_abc123",
    shouldExit: 1,
  },
  { label: "a test-mode secret key", value: "sk_test_abc123", shouldExit: 1 },
  { label: "a restricted key", value: "rk_live_abc123", shouldExit: 1 },
  { label: "garbage", value: "not-a-stripe-key", shouldExit: 1 },
];

/** Extracts the guard step's `run:` block body (everything after `run: |`). */
function guardRunBody(step) {
  const match = /run:\s*\|\n([\s\S]*)/.exec(step);
  if (!match) return null;
  const bodyLines = step
    .split("\n")
    .slice(step.split("\n").findIndex((l) => /run:\s*\|/.test(l)) + 1);
  // Stop at the first line that de-indents back to the step's own level
  // (i.e. a sibling key like `- name:` for the next step — stepBlocks()
  // already sliced those out, so this is just trimming trailing blanks).
  return bodyLines.join("\n").trimEnd();
}

describe.each([
  { file: ".github/workflows/e2e.yml", consumerMatcher: (t) => t.includes("name: Run E2E tests") },
  {
    file: ".github/workflows/deploy-static.yml",
    consumerMatcher: (t) => t.includes("pnpm build --filter=@mbe/hospitality"),
  },
])(
  "$file guards VITE_STRIPE_PUBLISHABLE_KEY before it is consumed",
  ({ file, consumerMatcher }) => {
    const yaml = readFileSync(resolve(ROOT, file), "utf8");
    const blocks = stepBlocks(yaml);
    const guardIndex = blocks.findIndex((b) => b.includes(GUARD_STEP_NAME));
    const guard = guardIndex >= 0 ? blocks[guardIndex] : null;

    it("has the guard step", () => {
      expect(guard, `no step named "${GUARD_STEP_NAME}" found in ${file}`).not.toBeNull();
    });

    it("wires the secret into the guard step's own env (not just the shared job env)", () => {
      expect(guard).toMatch(
        /VITE_STRIPE_PUBLISHABLE_KEY:\s*\$\{\{\s*secrets\.VITE_STRIPE_PUBLISHABLE_KEY\s*\}\}/
      );
    });

    it("never echoes the raw secret value", () => {
      const echoLines = (guard ?? "").split("\n").filter((l) => /\becho\b/.test(l));
      expect(echoLines.length).toBeGreaterThan(0);
      for (const line of echoLines) {
        expect(line).not.toMatch(/\$VITE_STRIPE_PUBLISHABLE_KEY|\$\{VITE_STRIPE_PUBLISHABLE_KEY\}/);
      }
    });

    it("runs before the step that consumes the key", () => {
      const consumerIndex = blocks.findIndex((b) => consumerMatcher(b));
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(consumerIndex).toBeGreaterThan(guardIndex);
    });

    it.each(CASES)("its shell logic exits $shouldExit for $label", ({ value, shouldExit }) => {
      const body = guardRunBody(guard ?? "");
      expect(body, `guard step in ${file} has no run: | body`).not.toBeNull();

      const result = spawnSync("bash", ["-c", body], {
        env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: value },
      });
      expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(shouldExit);
    });
  }
);

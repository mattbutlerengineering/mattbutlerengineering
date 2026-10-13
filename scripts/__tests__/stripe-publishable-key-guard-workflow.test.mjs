import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadWorkflow } from "../lib/workflow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/**
 * Name shared by both workflows' guard step — kept identical on purpose so a
 * future reader sees the same title in both jobs and knows it's one contract.
 */
const GUARD_STEP_NAME = "Validate VITE_STRIPE_PUBLISHABLE_KEY is a publishable key";

/**
 * Every step of a workflow in file order, from the parsed workflow
 * (scripts/lib/workflow.mjs, #6393), so a step's own `env:`/`run:` travels with
 * it regardless of field order.
 */
const allSteps = (workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps);

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

/** The guard step's `run:` body, or null when it has none. */
function guardRunBody(step) {
  return step?.run ? step.run.trimEnd() : null;
}

describe.each([
  { file: ".github/workflows/e2e.yml", consumerMatcher: (step) => step.name === "Run E2E tests" },
  {
    file: ".github/workflows/deploy-static.yml",
    consumerMatcher: (step) => step.run?.includes("pnpm build --filter=@mbe/hospitality"),
  },
  // e2e-screenshots.yml runs the same hospitality E2E suite as e2e.yml (via
  // `pnpm --dir apps/hospitality test:e2e`), so it hits the same spec files —
  // including any that assert on VITE_STRIPE_PUBLISHABLE_KEY being present —
  // and needs the identical guard + wiring, or it silently regresses the
  // moment a spec starts depending on the key (as deposit-enabled-config.spec.ts
  // now does, #4111).
  {
    file: ".github/workflows/e2e-screenshots.yml",
    consumerMatcher: (step) => step.name === "Run E2E tests",
  },
])(
  "$file guards VITE_STRIPE_PUBLISHABLE_KEY before it is consumed",
  ({ file, consumerMatcher }) => {
    const steps = allSteps(loadWorkflow(resolve(ROOT, file)));
    const guardIndex = steps.findIndex((step) => step.name === GUARD_STEP_NAME);
    const guard = guardIndex >= 0 ? steps[guardIndex] : null;

    it("has the guard step", () => {
      expect(guard, `no step named "${GUARD_STEP_NAME}" found in ${file}`).not.toBeNull();
    });

    it("wires the secret into the guard step's own env (not just the shared job env)", () => {
      expect(guard?.env.VITE_STRIPE_PUBLISHABLE_KEY).toMatch(
        /^\$\{\{\s*secrets\.VITE_STRIPE_PUBLISHABLE_KEY\s*\}\}$/
      );
    });

    it("never echoes the raw secret value", () => {
      const echoLines = (guard?.run ?? "").split("\n").filter((l) => /\becho\b/.test(l));
      expect(echoLines.length).toBeGreaterThan(0);
      for (const line of echoLines) {
        expect(line).not.toMatch(/\$VITE_STRIPE_PUBLISHABLE_KEY|\$\{VITE_STRIPE_PUBLISHABLE_KEY\}/);
      }
    });

    it("runs before the step that consumes the key", () => {
      const consumerIndex = steps.findIndex((step) => consumerMatcher(step));
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(consumerIndex).toBeGreaterThan(guardIndex);
    });

    it.each(CASES)("its shell logic exits $shouldExit for $label", ({ value, shouldExit }) => {
      const body = guardRunBody(guard);
      expect(body, `guard step in ${file} has no run: | body`).not.toBeNull();

      const result = spawnSync("bash", ["-c", body], {
        env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: value },
      });
      expect(result.status, `stderr: ${result.stderr?.toString()}`).toBe(shouldExit);
    });
  }
);

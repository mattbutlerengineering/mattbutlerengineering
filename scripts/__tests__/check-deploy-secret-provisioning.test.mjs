import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  findRequiredProductionSecrets,
  isSecretProvisioned,
  findUnprovisionedSecrets,
} from "../check-deploy-secret-provisioning.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// A minimal snippet reproducing how MANAGE_TOKEN_SECRET is wired into both
// deploy paths — used as the "provisioned" baseline in isolated tests.
const PROVISIONED_WORKFLOW_SNIPPET = `
        env:
          MANAGE_TOKEN_SECRET: \${{ secrets.MANAGE_TOKEN_SECRET }}
        run: |
          if [ -n "\${MANAGE_TOKEN_SECRET}" ]; then
            yq -i "(.services[] | select(.name == \\"reservations-api\\").envs) |=
              (map(select(.key != \\"MANAGE_TOKEN_SECRET\\")) +
              [{\\"key\\":\\"MANAGE_TOKEN_SECRET\\",\\"value\\":\\"\${MANAGE_TOKEN_SECRET}\\",\\"type\\":\\"SECRET\\"}])" /tmp/spec.yaml
          fi
`;

const PROVISIONED_PULUMI_SNIPPET = `
const manageTokenSecret = config.getSecret("manageTokenSecret");
...(manageTokenSecret ? [secretEnv("MANAGE_TOKEN_SECRET", manageTokenSecret)] : []),
`;

describe("findRequiredProductionSecrets", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "deploy-secret-provisioning-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds a secret name from a throw-in-production message", () => {
    writeFileSync(
      join(tmpDir, "foo-token.ts"),
      `
      if (isProduction) {
        if (!secret) {
          throw new Error("FOO_TOKEN_SECRET is required in production. Set this env var.");
        }
      }
      `
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual(["FOO_TOKEN_SECRET"]);
  });

  it("ignores config files that only warn (never throw) in production", () => {
    writeFileSync(
      join(tmpDir, "stripe-like.ts"),
      `console.warn("STRIPE_SECRET_KEY is not set. Stripe deposits are DISABLED.");`
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual([]);
  });

  it("ignores *.test.ts files", () => {
    writeFileSync(
      join(tmpDir, "foo-token.test.ts"),
      `throw new Error("FOO_TOKEN_SECRET is required in production.");`
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual([]);
  });

  it("de-duplicates a name mentioned more than once in the same file", () => {
    writeFileSync(
      join(tmpDir, "foo-token.ts"),
      `
      // FOO_TOKEN_SECRET is required in production for signing.
      throw new Error("FOO_TOKEN_SECRET is required in production. Set this env var.");
      `
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual(["FOO_TOKEN_SECRET"]);
  });

  // Wording-variant fixtures (#4067): the detector keys on AST structure
  // (throw new Error(...) reachable under a production guard, referencing
  // process.env.<NAME> in the enclosing scope), not on message phrasing —
  // so a differently-worded throw for the same invariant must still be
  // detected.
  it("detects a throw worded 'Missing <NAME> in production.'", () => {
    writeFileSync(
      join(tmpDir, "foo-token.ts"),
      `
      interface Input { nodeEnv: string | undefined; secret: string | undefined; }
      export function getFooTokenConfig(input: Input) {
        const isProduction = input.nodeEnv === "production";
        const secret = input.secret ?? "";
        if (isProduction) {
          if (!secret) {
            throw new Error("Missing FOO_TOKEN_SECRET in production.");
          }
        }
        return { secret };
      }
      `
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual(["FOO_TOKEN_SECRET"]);
  });

  it("detects a throw worded '<NAME> must be set in production' via template literal", () => {
    writeFileSync(
      join(tmpDir, "foo-token.ts"),
      `
      interface Input { nodeEnv: string | undefined; secret: string | undefined; }
      const NAME = "FOO_TOKEN_SECRET";
      export function getFooTokenConfig(input: Input) {
        const isProduction = input.nodeEnv === "production";
        const secret = input.secret ?? "";
        if (isProduction) {
          if (!secret) {
            throw new Error(\`\${NAME} must be set in production\`);
          }
        }
        return { secret };
      }
      `
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual(["FOO_TOKEN_SECRET"]);
  });

  it("detects a throw worded '<NAME> is required when NODE_ENV=production'", () => {
    writeFileSync(
      join(tmpDir, "foo-token.ts"),
      `
      export function getFooTokenConfig(input: { nodeEnv: string | undefined; secret: string | undefined }) {
        const secret = input.secret ?? "";
        if (process.env.NODE_ENV === "production") {
          if (!secret) {
            throw new Error("FOO_TOKEN_SECRET is required when NODE_ENV=production");
          }
        }
        return { secret };
      }
      `
    );

    expect(findRequiredProductionSecrets(tmpDir)).toEqual(["FOO_TOKEN_SECRET"]);
  });
});

describe("isSecretProvisioned", () => {
  it("returns true when the secret is wired in both the workflow and pulumi", () => {
    expect(
      isSecretProvisioned(
        "MANAGE_TOKEN_SECRET",
        PROVISIONED_WORKFLOW_SNIPPET,
        PROVISIONED_PULUMI_SNIPPET
      )
    ).toBe(true);
  });

  it("returns false when the workflow passthrough/upsert is missing", () => {
    expect(isSecretProvisioned("MANAGE_TOKEN_SECRET", "", PROVISIONED_PULUMI_SNIPPET)).toBe(false);
  });

  it("returns false when the pulumi secretEnv call is missing", () => {
    expect(isSecretProvisioned("MANAGE_TOKEN_SECRET", PROVISIONED_WORKFLOW_SNIPPET, "")).toBe(
      false
    );
  });

  it("returns false when the workflow upsert exists but isn't guarded on non-empty", () => {
    const unguarded = PROVISIONED_WORKFLOW_SNIPPET.replace(
      'if [ -n "${MANAGE_TOKEN_SECRET}" ]; then\n',
      ""
    ).replace(/\n {10}fi\n/, "\n");
    expect(isSecretProvisioned("MANAGE_TOKEN_SECRET", unguarded, PROVISIONED_PULUMI_SNIPPET)).toBe(
      false
    );
  });
});

describe("findUnprovisionedSecrets", () => {
  it("returns names present in configSource but missing from both deploy sources", () => {
    const result = findUnprovisionedSecrets({
      names: ["MANAGE_TOKEN_SECRET", "BRAND_NEW_SECRET"],
      workflowSource: PROVISIONED_WORKFLOW_SNIPPET,
      pulumiSource: PROVISIONED_PULUMI_SNIPPET,
    });
    expect(result).toEqual(["BRAND_NEW_SECRET"]);
  });

  it("returns an empty array when every name is provisioned", () => {
    const result = findUnprovisionedSecrets({
      names: ["MANAGE_TOKEN_SECRET"],
      workflowSource: PROVISIONED_WORKFLOW_SNIPPET,
      pulumiSource: PROVISIONED_PULUMI_SNIPPET,
    });
    expect(result).toEqual([]);
  });
});

// ── Regression guard: the real repo ─────────────────────────────────────────
// This is the actual CI gate acceptance criterion #3 asks for: every
// required-in-production secret declared under
// services/reservations/src/config/*.ts must be provisioned in BOTH
// deploy-services.yml and infrastructure/pulumi/index.ts. Without this test,
// the next config of this shape repeats #4064 (UNSUBSCRIBE_TOKEN_SECRET
// shipped in code with no deploy-side wiring, breaking every deploy).
describe("deploy-secret provisioning (real repo)", () => {
  it("every required-in-production reservations secret is provisioned in both deploy-services.yml and pulumi/index.ts", () => {
    const configDir = join(ROOT, "services/reservations/src/config");
    const workflowSource = readFileSync(
      join(ROOT, ".github/workflows/deploy-services.yml"),
      "utf8"
    );
    const pulumiSource = readFileSync(join(ROOT, "infrastructure/pulumi/index.ts"), "utf8");

    const names = findRequiredProductionSecrets(configDir);
    // Sanity check the scan actually found something — an empty result here
    // would make this test vacuously pass and provide zero protection.
    expect(names.length).toBeGreaterThan(0);

    const unprovisioned = findUnprovisionedSecrets({ names, workflowSource, pulumiSource });
    expect(unprovisioned).toEqual([]);
  });
});

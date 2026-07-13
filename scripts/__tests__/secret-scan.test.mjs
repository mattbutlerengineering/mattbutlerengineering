import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanForSecrets, SECRET_PATTERNS } from "../secret-scan.mjs";

// Build secret-shaped strings at runtime so the committed test file does not
// itself contain literal credential patterns (which the repo's gitleaks CI
// scan would flag). Concatenation breaks the literal match without changing
// what scanForSecrets sees at runtime.
const STRIPE_SK = "sk_live_" + "0123456789abcdefABCDEFgh";
const STRIPE_PK = "pk_live_" + "0123456789abcdefABCDEFgh";
const AWS_AKIA = "AKIA" + "ABCDEFGHIJKLMNOP";
const JWT =
  "eyJ" +
  "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJ" +
  "zdWIiOiIxMjM0NTY3ODkwIn0" +
  ".dGVzdHNpZ25hdHVyZQ";
const PEM = "-----BEGIN RSA PRIVATE KEY-----";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(repoRoot, ".claude", "hooks", "secret-scan.mjs");

// ---------------------------------------------------------------------------
// scanForSecrets — pure detection
// ---------------------------------------------------------------------------

describe("scanForSecrets", () => {
  it("passes clean content", () => {
    expect(scanForSecrets("const x = 1;\nexport default x;", "src/x.ts")).toEqual({
      matched: false,
      type: null,
    });
  });

  it("detects a Stripe live secret key", () => {
    const r = scanForSecrets(`const k = "${STRIPE_SK}";`, "src/pay.ts");
    expect(r.matched).toBe(true);
    expect(r.type).toMatch(/stripe/i);
  });

  it("detects a Stripe live publishable key", () => {
    expect(scanForSecrets(`const k = "${STRIPE_PK}";`, "src/pay.ts").matched).toBe(true);
  });

  it("detects an AWS access key id", () => {
    const r = scanForSecrets(`AWS_ACCESS_KEY_ID=${AWS_AKIA}`, "src/aws.ts");
    expect(r.matched).toBe(true);
    expect(r.type).toMatch(/aws/i);
  });

  it("detects a JSON Web Token", () => {
    const r = scanForSecrets(`const token = "${JWT}";`, "src/auth.ts");
    expect(r.matched).toBe(true);
    expect(r.type).toMatch(/jwt|web token/i);
  });

  it("detects a PEM private key header", () => {
    const r = scanForSecrets(`${PEM}\nMIIEvg...`, "src/key.ts");
    expect(r.matched).toBe(true);
    expect(r.type).toMatch(/pem|private key/i);
  });

  it("does not flag a Stripe TEST key (test-mode is allowed)", () => {
    expect(scanForSecrets(`const k = "sk_test_${"0123456789abcdef"}";`, "src/pay.ts").matched).toBe(
      false
    );
  });

  it("ignores allowlisted paths: .example files", () => {
    expect(scanForSecrets(`STRIPE_KEY=${STRIPE_SK}`, "services/x/.env.example").matched).toBe(
      false
    );
  });

  it("ignores allowlisted paths: test fixtures and __tests__", () => {
    expect(scanForSecrets(`const k = "${STRIPE_SK}";`, "src/__tests__/pay.test.ts").matched).toBe(
      false
    );
    expect(scanForSecrets(`const k = "${STRIPE_SK}";`, "fixtures/keys.ts").matched).toBe(false);
  });

  it("ignores empty / non-string content", () => {
    expect(scanForSecrets("", "src/x.ts")).toEqual({ matched: false, type: null });
    expect(scanForSecrets(null, "src/x.ts")).toEqual({ matched: false, type: null });
    expect(scanForSecrets(undefined, "src/x.ts")).toEqual({ matched: false, type: null });
  });

  it("exposes a non-empty pattern table", () => {
    expect(Array.isArray(SECRET_PATTERNS)).toBe(true);
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(4);
    for (const p of SECRET_PATTERNS) {
      expect(typeof p.type).toBe("string");
      expect(p.re).toBeInstanceOf(RegExp);
    }
  });
});

// ---------------------------------------------------------------------------
// Hook wrapper — stdin → exit code contract
// ---------------------------------------------------------------------------

function runHook(payload) {
  return spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
}

describe("secret-scan hook wrapper", () => {
  it("exits 0 silently on clean Write content", () => {
    const res = runHook({
      tool_name: "Write",
      tool_input: { file_path: "src/x.ts", content: "export const x = 1;" },
    });
    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("exits 2 with a typed message when a Write plants a secret", () => {
    const res = runHook({
      tool_name: "Write",
      tool_input: { file_path: "src/pay.ts", content: `const k = "${STRIPE_SK}";` },
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/BLOCK/);
    expect(res.stderr).toMatch(/stripe/i);
  });

  it("scans Edit new_string", () => {
    const res = runHook({
      tool_name: "Edit",
      tool_input: { file_path: "src/aws.ts", old_string: "x", new_string: `KEY=${AWS_AKIA}` },
    });
    expect(res.status).toBe(2);
  });

  it("scans MultiEdit edits[].new_string", () => {
    const res = runHook({
      tool_name: "MultiEdit",
      tool_input: {
        file_path: "src/k.ts",
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "c", new_string: PEM },
        ],
      },
    });
    expect(res.status).toBe(2);
  });

  it("ignores non-edit tools (exit 0)", () => {
    const res = runHook({ tool_name: "Bash", tool_input: { command: `echo ${STRIPE_SK}` } });
    expect(res.status).toBe(0);
  });

  it("fails open (exit 0) on malformed stdin", () => {
    const res = spawnSync("node", [HOOK], { input: "not-json{", encoding: "utf-8" });
    expect(res.status).toBe(0);
  });
});

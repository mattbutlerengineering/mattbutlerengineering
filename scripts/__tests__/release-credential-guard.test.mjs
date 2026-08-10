import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = resolve(ROOT, ".github/workflows/release.yml");
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");

/**
 * Pull the `# CREDENTIAL_GUARD_START ... # CREDENTIAL_GUARD_END` shell block
 * out of the workflow's credential-check step. Parsed textually (matching
 * the heredoc-extraction precedent in tier-classifier-workflow.test.mjs)
 * rather than with a YAML library — nothing in `scripts/` depends on one.
 */
function extractCredentialGuardScript(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.includes("# CREDENTIAL_GUARD_START"));
  if (start === -1) {
    throw new Error("release.yml has no `# CREDENTIAL_GUARD_START` marker");
  }
  const end = lines.findIndex((l, i) => i > start && l.includes("# CREDENTIAL_GUARD_END"));
  if (end === -1) {
    throw new Error("release.yml `CREDENTIAL_GUARD` block has no closing marker");
  }
  return lines.slice(start + 1, end).join("\n");
}

const tmpDirs = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Run the real guard script (extracted from release.yml) in a bash child process. */
function runGuard({ npmToken }) {
  const dir = mkdtempSync(join(tmpdir(), "release-credential-guard-test-"));
  tmpDirs.push(dir);
  const outputPath = join(dir, "github-output.txt");

  const script = extractCredentialGuardScript(WORKFLOW);

  const env = { ...process.env, GITHUB_OUTPUT: outputPath };
  if (npmToken === undefined) {
    delete env.NPM_TOKEN;
  } else {
    env.NPM_TOKEN = npmToken;
  }

  const result = spawnSync("bash", ["-c", script], { env, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`credential guard script exited ${result.status}: ${result.stderr}`);
  }

  const output = readFileSync(outputPath, "utf8");
  const hasCredential = output.match(/^has_credential=(.*)$/m)?.[1];
  return { hasCredential };
}

describe("release.yml credential guard", () => {
  it("reports has_credential=false when NPM_TOKEN is unset", () => {
    const { hasCredential } = runGuard({ npmToken: undefined });
    expect(hasCredential).toBe("false");
  });

  it("reports has_credential=false when NPM_TOKEN is empty", () => {
    const { hasCredential } = runGuard({ npmToken: "" });
    expect(hasCredential).toBe("false");
  });

  it("reports has_credential=true when NPM_TOKEN is set", () => {
    const { hasCredential } = runGuard({ npmToken: "fake-token-value" });
    expect(hasCredential).toBe("true");
  });

  it("gates version/build/commit/publish/push steps on both changesets and credential", () => {
    const gatedSteps = [
      "Version packages",
      "Build rialto",
      "Commit version bump",
      "Publish to npm",
      "Push version commit and release tags",
    ];
    for (const stepName of gatedSteps) {
      const idx = WORKFLOW.indexOf(`name: ${stepName}`);
      expect(idx, `step "${stepName}" not found`).toBeGreaterThan(-1);
      const nextLines = WORKFLOW.slice(idx, idx + 400);
      expect(nextLines).toMatch(
        /if: steps\.changesets\.outputs\.has_changesets == 'true' && steps\.credential\.outputs\.has_credential == 'true'/
      );
    }
  });

  it("emits a warning naming #3322 when the credential is absent, and does not publish", () => {
    const idx = WORKFLOW.indexOf("Warn on missing publish credential");
    expect(idx).toBeGreaterThan(-1);
    const block = WORKFLOW.slice(idx, idx + 600);
    expect(block).toMatch(
      /if: steps\.changesets\.outputs\.has_changesets == 'true' && steps\.credential\.outputs\.has_credential != 'true'/
    );
    expect(block).toMatch(/::warning::/);
    expect(block).toMatch(/#3322/);
  });

  it("keeps a comment above the guard explaining why it exists", () => {
    const idx = WORKFLOW.indexOf("# CREDENTIAL_GUARD_START");
    const preceding = WORKFLOW.slice(Math.max(0, idx - 800), idx);
    expect(preceding).toMatch(/#3322/);
  });
});

/**
 * Guard for the pipe-to-shell installer shape:
 *
 *   curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0
 *
 * GitHub Actions runs every `run:` block under `/usr/bin/bash -e {0}` — `-e`
 * only, never `-o pipefail` (see .claude/rules/gotchas.md § CI). So when the
 * `curl` fails, it writes nothing to stdout and exits non-zero, `sh` reads an
 * empty script and exits 0, and the pipeline's status is `sh`'s. The step goes
 * green having installed nothing, and every later command resolves whatever
 * binary the runner image happens to ship — which is the precise failure the
 * Pulumi pin exists to prevent (#4117/#4118: a runner image bump took Pulumi
 * 3.253.0 -> 3.256.0 and broke production infra deploys for hours with zero
 * repo changes).
 *
 * `.github/workflows/pulumi-preview.yml` already carried the `set -euo
 * pipefail` fix; `pulumi-up.yml` (the production apply path) and both arms of
 * `pulumi-r2-checksum-validation.yml` did not. This generalises that one fix
 * rather than re-asserting it per file, so a fifth install site cannot land
 * unguarded.
 */

import { describe, it, expect } from "vitest";
import {
  extractRunBlocks,
  checkWorkflow,
  findPipeToShellFindings,
} from "../check-pipe-to-shell-pipefail.mjs";

describe("extractRunBlocks", () => {
  it("returns each block scalar body with the line the `run:` key sits on", () => {
    const content = [
      "jobs:",
      "  build:",
      "    steps:",
      "      - name: One",
      "        run: |",
      "          echo first",
      "      - name: Two",
      "        run: |",
      "          echo second",
      "",
    ].join("\n");

    const blocks = extractRunBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].line).toBe(5);
    expect(blocks[0].body).toContain("echo first");
    expect(blocks[0].body).not.toContain("echo second");
    expect(blocks[1].line).toBe(8);
    expect(blocks[1].body).toContain("echo second");
  });

  it("captures a single-line `run:` value too", () => {
    const content = ["      - name: Inline", "        run: curl -fsSL https://x | sh", ""].join(
      "\n"
    );

    const blocks = extractRunBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toContain("curl -fsSL https://x | sh");
  });

  it("stops a block at the next key of equal or lesser indentation", () => {
    const content = [
      "      - name: Guarded",
      "        run: |",
      "          curl -fsSL https://x | sh",
      "        env:",
      "          FOO: bar",
      "",
    ].join("\n");

    expect(extractRunBlocks(content)[0].body).not.toContain("FOO");
  });
});

describe("checkWorkflow", () => {
  const unguarded = [
    "      - name: Pin Pulumi CLI",
    "        run: |",
    "          curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0",
    '          echo "$HOME/.pulumi/bin" >> "$GITHUB_PATH"',
    "",
  ].join("\n");

  it("flags a curl-into-sh pipeline with no pipefail", () => {
    const { errors } = checkWorkflow("pulumi-up.yml", unguarded);

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toMatch(/pipefail/);
  });

  it("accepts the same pipeline once the block sets `set -euo pipefail`", () => {
    const guarded = unguarded.replace(
      "        run: |\n",
      "        run: |\n          set -euo pipefail\n"
    );

    expect(checkWorkflow("pulumi-up.yml", guarded).errors).toEqual([]);
  });

  it("accepts a bare `set -o pipefail`", () => {
    const guarded = unguarded.replace(
      "        run: |\n",
      "        run: |\n          set -o pipefail\n"
    );

    expect(checkWorkflow("pulumi-up.yml", guarded).errors).toEqual([]);
  });

  it("accepts `wget ... | bash` when guarded, flags it when not", () => {
    const body = (prefix) =>
      [
        "      - name: Install",
        "        run: |",
        prefix,
        "          wget -qO- https://x | bash",
        "",
      ]
        .filter(Boolean)
        .join("\n");

    expect(checkWorkflow("a.yml", body("          set -euo pipefail")).errors).toEqual([]);
    expect(checkWorkflow("a.yml", body(null)).errors).toHaveLength(1);
  });

  it("ignores a pipe whose sink is not a shell", () => {
    const jq = [
      "      - name: Query",
      "        run: |",
      "          curl -fsSL https://api.example.com | jq .version",
      "",
    ].join("\n");

    expect(checkWorkflow("a.yml", jq).errors).toEqual([]);
  });

  it("ignores a shell invocation that is not fed by a pipe", () => {
    const direct = [
      "      - name: Run arm",
      "        run: |",
      "          bash scripts/run-pulumi-r2-validation-arm.sh with-fix",
      "",
    ].join("\n");

    expect(checkWorkflow("a.yml", direct).errors).toEqual([]);
  });

  it("judges each run block independently within one workflow", () => {
    const mixed = [
      "      - name: Guarded",
      "        run: |",
      "          set -euo pipefail",
      "          curl -fsSL https://x | sh",
      "      - name: Unguarded",
      "        run: |",
      "          curl -fsSL https://y | sh",
      "",
    ].join("\n");

    const { errors } = checkWorkflow("a.yml", mixed);

    // A `set -euo pipefail` in a *different* step does not protect this one —
    // each `run:` block is its own shell process.
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(6);
  });
});

describe("the real .github/workflows tree", () => {
  it("has no pipe-to-shell installer running without pipefail", () => {
    const { findings } = findPipeToShellFindings();

    expect(
      findings.map((f) => `${f.workflow}:${f.line} ${f.message}`),
      "a failed download would leave these steps green with nothing installed"
    ).toEqual([]);
  });
});

/**
 * Guard for the wrong-version case #5764 (pipefail) does not close: a
 * `curl … get.pulumi.com | sh` that SUCCEEDS but installs something other
 * than the requested version — a redirect, a changed installer contract, a
 * yanked release, a partially-populated `$HOME/.pulumi/bin` — would leave
 * every step green and every later command silently running an unverified
 * Pulumi.
 *
 * `.github/workflows/pulumi-up.yml` (the production apply path) and both
 * arms of `pulumi-r2-checksum-validation.yml` (a harness that exists to
 * produce a citable verdict about a *specific* version) are exactly where a
 * misattributed version matters most.
 */

import { describe, it, expect } from "vitest";
import { checkWorkflow, findVersionAssertionFindings } from "../check-pulumi-version-assertion.mjs";

describe("checkWorkflow", () => {
  const installOnly = [
    "      - name: Pin Pulumi CLI",
    "        run: |",
    "          set -euo pipefail",
    "          curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0",
    '          echo "$HOME/.pulumi/bin" >> "$GITHUB_PATH"',
    "",
  ].join("\n");

  it("flags an install with no version assertion at all", () => {
    const { errors } = checkWorkflow("pulumi-up.yml", installOnly);

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toMatch(/without asserting the installed version/);
  });

  it("accepts an install followed by an explicit-path check that fails on mismatch", () => {
    const guarded =
      installOnly +
      [
        '          installed="$("$HOME/.pulumi/bin/pulumi" version)"',
        '          if [ "$installed" != "v3.253.0" ]; then',
        '            echo "expected Pulumi v3.253.0, got \\"$installed\\"" >&2',
        "            exit 1",
        "          fi",
        "",
      ].join("\n");

    expect(checkWorkflow("pulumi-up.yml", guarded).errors).toEqual([]);
  });

  it("flags a bare `pulumi version` call — GITHUB_PATH has not taken effect within this step", () => {
    const bareCall =
      installOnly +
      [
        '          installed="$(pulumi version)"',
        '          if [ "$installed" != "v3.253.0" ]; then',
        "            exit 1",
        "          fi",
        "",
      ].join("\n");

    const { errors } = checkWorkflow("pulumi-up.yml", bareCall);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/without asserting the installed version/);
  });

  it("flags an explicit-path version query that never fails the step", () => {
    const noExit =
      installOnly +
      [
        '          installed="$("$HOME/.pulumi/bin/pulumi" version)"',
        '          echo "installed: $installed"',
        "",
      ].join("\n");

    const { errors } = checkWorkflow("pulumi-up.yml", noExit);
    expect(errors).toHaveLength(1);
  });

  it("flags a version check placed before the $GITHUB_PATH line as absent", () => {
    // Placed before GITHUB_PATH, an explicit-path call to a binary that has
    // not been installed there yet is not the assertion this check wants —
    // the check only looks after the PATH line.
    const beforePath = [
      "      - name: Pin Pulumi CLI",
      "        run: |",
      "          set -euo pipefail",
      '          installed="$("$HOME/.pulumi/bin/pulumi" version)"',
      '          if [ "$installed" != "v3.253.0" ]; then exit 1; fi',
      "          curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0",
      '          echo "$HOME/.pulumi/bin" >> "$GITHUB_PATH"',
      "",
    ].join("\n");

    const { errors } = checkWorkflow("pulumi-up.yml", beforePath);
    expect(errors).toHaveLength(1);
  });

  it("ignores a block with no Pulumi install at all", () => {
    const unrelated = [
      "      - name: Something else",
      "        run: |",
      "          echo hello",
      "",
    ].join("\n");

    expect(checkWorkflow("a.yml", unrelated).errors).toEqual([]);
  });

  it("flags a Pulumi install that never adds the CLI to $GITHUB_PATH", () => {
    const noPath = [
      "      - name: Pin Pulumi CLI",
      "        run: |",
      "          set -euo pipefail",
      "          curl -fsSL https://get.pulumi.com | sh -s -- --version 3.253.0",
      "",
    ].join("\n");

    const { errors } = checkWorkflow("a.yml", noPath);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/never adds it to \$GITHUB_PATH/);
  });

  it("judges each run block independently, using an env-derived expected version", () => {
    const harnessArm =
      [
        "      - name: Install Pulumi CLI under test",
        "        env:",
        "          PULUMI_VERSION_INPUT: ${{ inputs.pulumi_version }}",
        "        run: |",
        "          set -euo pipefail",
        '          curl -fsSL https://get.pulumi.com | sh -s -- --version "$PULUMI_VERSION_INPUT"',
        '          echo "$HOME/.pulumi/bin" >> "$GITHUB_PATH"',
        '          installed="$("$HOME/.pulumi/bin/pulumi" version)"',
        '          if [ "$installed" != "v$PULUMI_VERSION_INPUT" ]; then',
        '            echo "expected Pulumi v$PULUMI_VERSION_INPUT, got \\"$installed\\"" >&2',
        "            exit 1",
        "          fi",
        "",
      ].join("\n") + installOnly; // second block unguarded

    const { errors } = checkWorkflow("harness.yml", harnessArm);
    expect(errors).toHaveLength(1);
  });
});

describe("the real .github/workflows tree", () => {
  it("has no Pulumi CLI install running without a version assertion", () => {
    const { findings } = findVersionAssertionFindings();

    expect(
      findings.map((f) => `${f.workflow}:${f.line} ${f.message}`),
      "a wrong-version install would leave every later step running an unverified Pulumi"
    ).toEqual([]);
  });
});

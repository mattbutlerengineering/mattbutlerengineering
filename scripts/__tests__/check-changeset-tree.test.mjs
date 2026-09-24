/**
 * Unit tests for the pure classifier in scripts/check-changeset-tree.mjs.
 *
 * Regression coverage for #3322/#5713: `changeset version` (the Release
 * workflow's "Version packages" step) errored with
 *
 *   Invalid tree: "@mattbutlerengineering/rialto" depends on the skipped
 *   package "@mbe/api-client", but "@mattbutlerengineering/rialto" is not
 *   skipped. Please add "@mattbutlerengineering/rialto" to the "ignore"
 *   option.
 *
 * on every push to main once #5713 removed the credential guard that used
 * to skip the step. `changeset status` runs the identical
 * @changesets/config validation `changeset version` does, without needing
 * GITHUB_TOKEN — these fixtures are real captured output from both states.
 */

import { describe, it, expect } from "vitest";
import { classifyChangesetStatus } from "../check-changeset-tree.mjs";

describe("classifyChangesetStatus", () => {
  it("passes (no findings) on a clean exit", () => {
    const output =
      "🦋 changeset v3.0.3\n\nPackages to be bumped:\n- major\n  - @mattbutlerengineering/rialto\n";
    expect(classifyChangesetStatus({ status: 0, output })).toEqual([]);
  });

  it("passes when there are no pending changesets at all", () => {
    const output = "🦋 changeset v3.0.3\n\nNo unreleased changesets found\n";
    expect(classifyChangesetStatus({ status: 0, output })).toEqual([]);
  });

  it("extracts the invalid-tree finding from a real captured failure", () => {
    const output =
      '🦋 changeset v3.0.3\n\nFound issues in your config:\n- Invalid tree: "@mattbutlerengineering/rialto" depends on the skipped package "@mbe/api-client", but "@mattbutlerengineering/rialto" is not skipped. Please add "@mattbutlerengineering/rialto" to the "ignore" option.\n🦋 Exited with code 1\n\n';
    expect(classifyChangesetStatus({ status: 1, output })).toEqual([
      'Invalid tree: "@mattbutlerengineering/rialto" depends on the skipped package "@mbe/api-client", but "@mattbutlerengineering/rialto" is not skipped. Please add "@mattbutlerengineering/rialto" to the "ignore" option.',
    ]);
  });

  it("extracts multiple config-issue lines when more than one is reported", () => {
    const output =
      "🦋 changeset v3.0.3\n\nFound issues in your config:\n- Invalid tree: first issue\n- Invalid tree: second issue\n🦋 Exited with code 1\n\n";
    expect(classifyChangesetStatus({ status: 1, output })).toEqual([
      "Invalid tree: first issue",
      "Invalid tree: second issue",
    ]);
  });

  it("falls back to the raw output tail on an unrecognized non-zero exit", () => {
    const output = "some unexpected crash trace";
    expect(classifyChangesetStatus({ status: 1, output })).toEqual([output]);
  });

  it("falls back to a status-only message when a failing run has no output", () => {
    expect(classifyChangesetStatus({ status: 1, output: "" })).toEqual([
      "changeset status exited 1",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exitCodeFromFile } from "../sentry-heartbeat.mjs";

const SCRIPT = fileURLToPath(new URL("../sentry-heartbeat.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "sentry-heartbeat-cli-"));

function fixture(name, contents) {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

const passing = JSON.stringify([
  { project: "users-api", pass: true, targets: [{ targetId: "users-api", outcome: "confirmed" }] },
]);
const failing = JSON.stringify([
  { project: "users-api", pass: true, targets: [] },
  { project: "mattbutlerengineering", pass: false, targets: [] },
]);

describe("exitCodeFromFile", () => {
  it("is 0 for an all-pass verdict file", () => {
    expect(exitCodeFromFile(fixture("pass.json", passing))).toBe(0);
  });

  it("is 1 when the file records a failing project", () => {
    expect(exitCodeFromFile(fixture("fail.json", failing))).toBe(1);
  });

  it("is 2 for a missing or unparseable file", () => {
    expect(exitCodeFromFile(join(dir, "does-not-exist.json"))).toBe(2);
    expect(exitCodeFromFile(fixture("garbage.json", "{not json"))).toBe(2);
    expect(exitCodeFromFile(undefined)).toBe(2);
  });
});

describe("sentry-heartbeat.mjs --exit-from", () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

  it("exits 2 for a nonexistent verdict file", () => {
    expect(run("--exit-from", "/nonexistent").status).toBe(2);
  });

  it("exits with the aggregate verdict of the file", () => {
    expect(run("--exit-from", fixture("pass-cli.json", passing)).status).toBe(0);
    expect(run("--exit-from", fixture("fail-cli.json", failing)).status).toBe(1);
  });

  it("exits 2 with usage when given no mode", () => {
    expect(run().status).toBe(2);
  });
});

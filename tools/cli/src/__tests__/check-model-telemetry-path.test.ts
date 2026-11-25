import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveQueueTelemetryPath } from "../commands/agent/check-model.js";

// Queue telemetry moved to the metrics-data branch checkout (.metrics-data/).
// check-model's token estimate must read it there, not main's frozen copy.
describe("resolveQueueTelemetryPath", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reads the metrics-data checkout when it exists", () => {
    root = mkdtempSync(join(tmpdir(), "check-model-"));
    mkdirSync(join(root, ".metrics-data"));
    expect(resolveQueueTelemetryPath(root)).toBe(
      join(root, ".metrics-data", "queue-telemetry.jsonl")
    );
  });

  it("falls back to metrics/ when there is no checkout", () => {
    root = mkdtempSync(join(tmpdir(), "check-model-"));
    expect(resolveQueueTelemetryPath(root)).toBe(join(root, "metrics", "queue-telemetry.jsonl"));
  });
});

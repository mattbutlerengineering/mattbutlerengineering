import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { resolveQueueTelemetryPath } from "../commands/agent/check-model.js";

// Queue telemetry lives only on the metrics-data branch checkout
// (.metrics-data/); main no longer carries a copy to fall back to (#9815).
describe("resolveQueueTelemetryPath", () => {
  it("always points into the metrics-data checkout", () => {
    expect(resolveQueueTelemetryPath("/repo")).toBe(
      join("/repo", ".metrics-data", "queue-telemetry.jsonl")
    );
  });
});

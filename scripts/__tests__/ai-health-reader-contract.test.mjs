import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "../build-sensor-report.mjs";
import { AI_HEALTH_READ_FIELDS } from "../../apps/marketing/src/data/ai-health.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const committed = JSON.parse(
  readFileSync(resolve(ROOT, "apps/marketing/public/sensor-report.json"), "utf8")
);

describe("AI Health page reader fields ⊆ builder fields", () => {
  it("summary fields are emitted by buildReport()", () => {
    const { summary } = buildReport({}, undefined, {}, new Date("2026-01-01T00:00:00Z"));
    for (const field of AI_HEALTH_READ_FIELDS.summary) {
      expect(Object.keys(summary)).toContain(field);
    }
  });

  it.each(Object.entries(AI_HEALTH_READ_FIELDS.sensors))(
    "sensors.%s fields are emitted by the collector",
    (sensor, fields) => {
      const emitted = Object.keys(committed.sensors[sensor] ?? {});
      for (const field of fields) {
        expect(emitted).toContain(field);
      }
    }
  );

  it("issues collector source emits the `open` field", () => {
    const src = readFileSync(resolve(ROOT, "scripts/sensors-registry.mjs"), "utf8");
    expect(src).toMatch(/open:\s*openIssues\.length/);
  });
});

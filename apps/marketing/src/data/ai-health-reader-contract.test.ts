import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_HEALTH_READ_FIELDS } from "./ai-health.js";

const REPO_ROOT = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");
const committed = JSON.parse(read("apps/marketing/public/sensor-report.json")) as {
  sensors: Record<string, Record<string, unknown> | undefined>;
};

type BuildReport = (
  sensors: object,
  previous: undefined,
  thresholds: object,
  now: Date
) => { summary: Record<string, unknown> };

describe("AI Health page reader fields ⊆ builder fields", () => {
  it("summary fields are emitted by buildReport()", async () => {
    // Variable specifier: this is a runtime contract check against the Node-side
    // builder, not a typed import (scripts/ is plain .mjs).
    const builderPath = resolve(REPO_ROOT, "scripts/build-sensor-report.mjs");
    const { buildReport } = (await import(/* @vite-ignore */ builderPath)) as {
      buildReport: BuildReport;
    };
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
    expect(read("scripts/sensors-registry.mjs")).toMatch(/open:\s*openIssues\.length/);
  });
});

import { GhAuthError } from "@mbe/gh-client";
import { describe, it, expect } from "vitest";
import { upsertQueueEfficiencyRow, recordQueueEfficiency } from "../record-queue-efficiency.mjs";

const row = (date, sensor, extra = {}) =>
  JSON.stringify({ date, sensor, available: false, ...extra });

describe("upsertQueueEfficiencyRow", () => {
  it("appends a new row after existing ones", () => {
    const out = upsertQueueEfficiencyRow(row("2026-10-11", "queueEfficiency") + "\n", {
      date: "2026-10-12",
      sensor: "queueEfficiency",
      available: true,
    });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).date).toBe("2026-10-12");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("replaces a same-day queueEfficiency row rather than duplicating it", () => {
    const out = upsertQueueEfficiencyRow(
      row("2026-10-12", "queueEfficiency", { reason: "credential_rejected" }) + "\n",
      { date: "2026-10-12", sensor: "queueEfficiency", available: true, composite: 0.7 }
    );
    const lines = out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ available: true, composite: 0.7 });
  });

  it("never replaces a same-day available row with an unavailable one (#7581)", () => {
    const good = JSON.stringify({
      date: "2026-10-12",
      sensor: "queueEfficiency",
      available: true,
      composite: 0.9,
    });
    const out = upsertQueueEfficiencyRow(good + "\n", {
      date: "2026-10-12",
      sensor: "queueEfficiency",
      available: false,
      reason: "query_error",
    });
    expect(out).toBe(good + "\n");
  });

  it("keeps same-day rows from other sensors and tolerates an empty file", () => {
    const out = upsertQueueEfficiencyRow(row("2026-10-12", "ciHealth") + "\n", {
      date: "2026-10-12",
      sensor: "queueEfficiency",
      available: true,
    });
    expect(out.trim().split("\n")).toHaveLength(2);
    expect(upsertQueueEfficiencyRow("", { date: "d", sensor: "queueEfficiency" })).toBe(
      JSON.stringify({ date: "d", sensor: "queueEfficiency" }) + "\n"
    );
  });
});

describe("recordQueueEfficiency", () => {
  it("builds the process-metrics entry from the injected collector result", () => {
    const entry = recordQueueEfficiency({
      now: new Date("2026-10-12T11:30:00Z"),
      collect: () => ({ available: false, reason: "credential_rejected" }),
    });
    expect(entry).toMatchObject({
      date: "2026-10-12",
      sensor: "queueEfficiency",
      available: false,
      reason: "credential_rejected",
    });
  });

  it("classifies a throwing PR reader instead of reporting no_data_in_range", () => {
    const entry = recordQueueEfficiency({
      now: new Date("2026-10-12T11:30:00Z"),
      readPrs: () => {
        throw new GhAuthError("GET", "/repos/o/r/pulls", 401, "Bad credentials");
      },
    });
    expect(entry.available).toBe(false);
    expect(entry.reason).toBe("credential_rejected");
  });

  it("retries a transient GitHub 5xx and records the successful result (#7581)", () => {
    const results = [
      { available: false, reason: "query_error", error: "HTTP 502: 502 Bad Gateway" },
      { available: false, reason: "query_error", error: "spawnSync gh ETIMEDOUT" },
      { available: true, composite: 0.9 },
    ];
    let calls = 0;
    const entry = recordQueueEfficiency({
      now: new Date("2026-10-12T11:30:00Z"),
      collect: () => results[calls++],
      sleep: () => {},
    });
    expect(calls).toBe(3);
    expect(entry.available).toBe(true);
  });

  it("does not retry a credential failure", () => {
    let calls = 0;
    const entry = recordQueueEfficiency({
      now: new Date("2026-10-12T11:30:00Z"),
      collect: () => {
        calls++;
        return { available: false, reason: "credential_rejected", error: "HTTP 401" };
      },
      sleep: () => {},
    });
    expect(calls).toBe(1);
    expect(entry.reason).toBe("credential_rejected");
  });
});

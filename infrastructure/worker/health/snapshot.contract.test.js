/**
 * Pins the dependency-free snapshot parser to the canonical zod schema: any
 * payload `systemHealthSchema` accepts must normalise losslessly, so the
 * parser cannot drift from the contract (#6385).
 */

import { describe, it, expect } from "vitest";
import { systemHealthSchema } from "../../../packages/types/src/schemas/health-system.js";
import { parseHealthSnapshot } from "./snapshot.js";

const run = { conclusion: "success", updated_at: "2026-10-12T00:00:00Z" };

const coarse = {
  status: "healthy",
  timestamp: "2026-10-12T00:00:00Z",
  requestId: "r",
  subsystems: {
    services: { status: "healthy" },
    static_sites: { status: "healthy" },
    ci: { status: "healthy" },
    deploys: { status: "degraded" },
  },
};

const detailed = {
  ...coarse,
  subsystems: {
    services: {
      status: "degraded",
      checks: {
        users: { status: "ok", latency: 12 },
        reservations: { status: "error", latency: 9 },
      },
    },
    static_sites: { status: "healthy", checks: { hospitality: { status: "ok", latency: 3 } } },
    ci: { status: "healthy", last_run: run },
    deploys: { status: "healthy", pipelines: { static: run } },
    migrations: { status: "healthy", checks: { users: { status: "ok", last_run: run } } },
  },
};

describe("parseHealthSnapshot vs systemHealthSchema", () => {
  it("coarse: every schema subsystem is surfaced with its status", () => {
    const schema = systemHealthSchema.parse(coarse);
    const parsed = parseHealthSnapshot(coarse);
    for (const [name, sub] of Object.entries(schema.subsystems)) {
      expect(parsed.subsystems[name]).toEqual({ status: sub.status });
    }
    expect(parsed.probes).toEqual({});
  });

  it("detailed: every schema probe is surfaced with status and latency", () => {
    const schema = systemHealthSchema.parse(detailed);
    const parsed = parseHealthSnapshot(detailed);
    const expected = {
      ...schema.subsystems.services.checks,
      ...schema.subsystems.static_sites.checks,
    };
    expect(parsed.probes).toEqual(
      Object.fromEntries(
        Object.entries(expected).map(([k, v]) => [k, { status: v.status, latency: v.latency }])
      )
    );
    expect(parsed.subsystems.migrations).toEqual({ status: "healthy" });
  });

  it("tolerates garbage without throwing", () => {
    expect(parseHealthSnapshot(null).probes).toEqual({});
    expect(parseHealthSnapshot({ status: "error" }).subsystems).toEqual({});
  });
});

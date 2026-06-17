/**
 * Contract tests for deploy-health module.
 *
 * Verifies write→interpret round-trips: every conclusion the
 * report-deploy-health action can write, interpretDeployHealth classifies
 * correctly. Also covers the staleness boundary.
 */

import { describe, it, expect } from "vitest";
import {
  DEPLOY_HEALTH_CONCLUSIONS,
  STALENESS_THRESHOLD_MS,
  interpretDeployHealth,
} from "./deploy-health.js";

// ── Helpers ──────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed reference time (ms) for deterministic tests

function makeRecord(conclusion, offsetMs = 0) {
  const updatedAt = new Date(NOW - offsetMs).toISOString();
  return { conclusion, sha: "abc123", updated_at: updatedAt };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("DEPLOY_HEALTH_CONCLUSIONS", () => {
  it("defines the canonical conclusion values", () => {
    expect(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS).toBe("success");
    expect(DEPLOY_HEALTH_CONCLUSIONS.FAILURE).toBe("failure");
    expect(DEPLOY_HEALTH_CONCLUSIONS.CANCELLED).toBe("cancelled");
    expect(DEPLOY_HEALTH_CONCLUSIONS.ROLLED_BACK).toBe("rolled_back");
  });
});

describe("STALENESS_THRESHOLD_MS", () => {
  it("is exactly 72 hours in milliseconds", () => {
    expect(STALENESS_THRESHOLD_MS).toBe(72 * 60 * 60 * 1_000);
  });
});

describe("interpretDeployHealth — null / missing data", () => {
  it("returns stale when kvData is null", () => {
    const result = interpretDeployHealth(null, NOW);
    expect(result.status).toBe("stale");
    expect(result.last_run).toBeNull();
  });

  it("returns stale when kvData is undefined", () => {
    const result = interpretDeployHealth(undefined, NOW);
    expect(result.status).toBe("stale");
  });
});

describe("interpretDeployHealth — staleness boundary", () => {
  it("returns stale when record is older than 72h", () => {
    const old = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, STALENESS_THRESHOLD_MS + 1);
    const result = interpretDeployHealth(old, NOW);
    expect(result.status).toBe("stale");
    expect(result.last_run).toEqual(old);
  });

  it("returns healthy when record is exactly at 72h boundary (not stale)", () => {
    // Exactly at threshold — not yet stale
    const atBoundary = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, STALENESS_THRESHOLD_MS);
    const result = interpretDeployHealth(atBoundary, NOW);
    expect(result.status).toBe("healthy");
  });

  it("returns healthy when record is just under 72h", () => {
    const fresh = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, STALENESS_THRESHOLD_MS - 1);
    const result = interpretDeployHealth(fresh, NOW);
    expect(result.status).toBe("healthy");
  });
});

describe("interpretDeployHealth — success round-trip", () => {
  it("classifies success conclusion as healthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS);
    const result = interpretDeployHealth(record, NOW);
    expect(result.status).toBe("healthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — failure round-trip", () => {
  it("classifies failure conclusion as unhealthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.FAILURE);
    const result = interpretDeployHealth(record, NOW);
    expect(result.status).toBe("unhealthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — rolled_back round-trip", () => {
  it("classifies rolled_back conclusion as unhealthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.ROLLED_BACK);
    const result = interpretDeployHealth(record, NOW);
    expect(result.status).toBe("unhealthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — cancelled round-trip", () => {
  it("classifies cancelled conclusion as unhealthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.CANCELLED);
    const result = interpretDeployHealth(record, NOW);
    expect(result.status).toBe("unhealthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — last_run passthrough", () => {
  it("includes full record in last_run for all conclusions", () => {
    const conclusions = Object.values(DEPLOY_HEALTH_CONCLUSIONS);
    for (const conclusion of conclusions) {
      const record = makeRecord(conclusion);
      const result = interpretDeployHealth(record, NOW);
      expect(result.last_run).toEqual(record);
    }
  });

  it("preserves apps_deployed field when present (static deploy records)", () => {
    const record = {
      conclusion: DEPLOY_HEALTH_CONCLUSIONS.SUCCESS,
      sha: "abc123",
      updated_at: new Date().toISOString(),
      apps_deployed: { marketing: "true", hospitality: "false", rialto: "true" },
    };
    const result = interpretDeployHealth(record, NOW);
    expect(result.status).toBe("healthy");
    expect(result.last_run.apps_deployed).toEqual(record.apps_deployed);
  });
});

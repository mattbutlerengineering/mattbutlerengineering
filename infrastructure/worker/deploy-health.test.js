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
    const result = interpretDeployHealth(null);
    expect(result.status).toBe("stale");
    expect(result.last_run).toBeNull();
  });

  it("returns stale when kvData is undefined", () => {
    const result = interpretDeployHealth(undefined);
    expect(result.status).toBe("stale");
  });
});

describe("interpretDeployHealth — success is age-independent", () => {
  it("returns healthy for a successful record older than 72h (a quiet, change-driven pipeline is not a fault)", () => {
    const old = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, STALENESS_THRESHOLD_MS + 1);
    const result = interpretDeployHealth(old);
    expect(result.status).toBe("healthy");
    expect(result.last_run).toEqual(old);
  });

  it("returns healthy for a very old successful record (weeks idle)", () => {
    const ancient = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, 30 * 24 * 60 * 60 * 1_000);
    expect(interpretDeployHealth(ancient).status).toBe("healthy");
  });

  it("returns healthy for a recent successful record", () => {
    const fresh = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS, STALENESS_THRESHOLD_MS - 1);
    expect(interpretDeployHealth(fresh).status).toBe("healthy");
  });
});

describe("interpretDeployHealth — success round-trip", () => {
  it("classifies success conclusion as healthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.SUCCESS);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("healthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — failure round-trip", () => {
  it("classifies failure conclusion as unhealthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.FAILURE);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("unhealthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — rolled_back round-trip", () => {
  it("classifies rolled_back conclusion as unhealthy", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.ROLLED_BACK);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("unhealthy");
    expect(result.last_run).toEqual(record);
  });
});

describe("interpretDeployHealth — cancelled round-trip", () => {
  it("classifies cancelled conclusion as stale (DO+Pulumi race artifact, not a real failure)", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.CANCELLED);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("stale");
    expect(result.last_run).toEqual(record);
  });

  it("still classifies failure as unhealthy (regression guard)", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.FAILURE);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("unhealthy");
  });

  it("still classifies rolled_back as unhealthy (regression guard)", () => {
    const record = makeRecord(DEPLOY_HEALTH_CONCLUSIONS.ROLLED_BACK);
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("unhealthy");
  });
});

describe("interpretDeployHealth — last_run passthrough", () => {
  it("includes full record in last_run for all conclusions", () => {
    const conclusions = Object.values(DEPLOY_HEALTH_CONCLUSIONS);
    for (const conclusion of conclusions) {
      const record = makeRecord(conclusion);
      const result = interpretDeployHealth(record);
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
    const result = interpretDeployHealth(record);
    expect(result.status).toBe("healthy");
    expect(result.last_run.apps_deployed).toEqual(record.apps_deployed);
  });
});

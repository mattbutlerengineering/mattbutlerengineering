/**
 * #8419: the `gen` zone had never recorded a check, and nothing tracked could
 * say so. These cover the sweep → committed-row → "never recorded" chain.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SURFACE_REGISTRY, ZONES } from "@mbe/agent-core";
import {
  classifySweepResult,
  parseSweepResults,
  buildAuditCoverageRow,
  neverRecordedZones,
} from "../audit-coverage.mjs";
import { SENSORS } from "../sensors-registry.mjs";
import { append } from "../metrics-store.mjs";

const meta = { date: "2026-11-07", commit: "abc" };
const gen = SURFACE_REGISTRY.find((s) => s.id === "gen:playground");
const marketing = SURFACE_REGISTRY.find((s) => s.id === "marketing:home");

describe("classifySweepResult", () => {
  it("marks a reachable auth0 surface auth-gated, naming the method", () => {
    expect(classifySweepResult({ code: "200" }, gen)).toEqual({
      status: "auth-gated",
      detail: "availability at public login page (HTTP 200)",
    });
  });

  it("marks a reachable public surface available", () => {
    expect(classifySweepResult({ code: "301" }, marketing).status).toBe("available");
  });

  it("marks 000/403/5xx as error", () => {
    for (const code of ["000", "403", "503"]) {
      expect(classifySweepResult({ code }, marketing).status).toBe("error");
    }
  });
});

describe("parseSweepResults", () => {
  it("parses tab-separated lines and drops malformed ones", () => {
    const text = `${gen.url}\t200\t0.31\nnot a url\t200\nhttps://x.test/\tabc\n\n${marketing.url}\t000\t0`;
    expect(parseSweepResults(text)).toEqual([
      { url: gen.url, code: "200" },
      { url: marketing.url, code: "000" },
    ]);
  });
});

describe("buildAuditCoverageRow", () => {
  it("records gen:playground as auth-gated and leaves unvisited surfaces unchecked", () => {
    const row = buildAuditCoverageRow([{ url: gen.url, code: "200" }], meta, SURFACE_REGISTRY);
    expect(row.surfaces.find((s) => s.id === "gen:playground")).toMatchObject({
      zone: "gen",
      status: "auth-gated",
    });
    expect(row.zones.gen).toEqual({ surfaces: 1, recorded: 1 });
    expect(row.zones.hospitality.recorded).toBe(0);
    expect(row.surfaces).toHaveLength(SURFACE_REGISTRY.length);
  });

  it("matches a trailing-slash URL difference", () => {
    const row = buildAuditCoverageRow(
      [{ url: `${gen.url}/`, code: "200" }],
      meta,
      SURFACE_REGISTRY
    );
    expect(row.zones.gen.recorded).toBe(1);
  });

  it("returns null when no registry surface was visited", () => {
    expect(buildAuditCoverageRow([], meta, SURFACE_REGISTRY)).toBeNull();
    expect(
      buildAuditCoverageRow([{ url: "https://other.test/", code: "200" }], meta, SURFACE_REGISTRY)
    ).toBeNull();
  });
});

describe("neverRecordedZones", () => {
  it("is empty when there are no rows (nothing to derive zones from)", () => {
    expect(neverRecordedZones([])).toEqual([]);
    expect(neverRecordedZones([], ZONES)).toEqual([...ZONES]);
  });

  it("drops a zone once any row recorded it", () => {
    const row = buildAuditCoverageRow([{ url: gen.url, code: "200" }], meta, SURFACE_REGISTRY);
    const never = neverRecordedZones([row]);
    expect(never).not.toContain("gen");
    expect(never).toContain("hospitality");
  });

  it("a zone that only ever errored still counts as recorded", () => {
    const row = buildAuditCoverageRow([{ url: gen.url, code: "000" }], meta, SURFACE_REGISTRY);
    expect(neverRecordedZones([row])).not.toContain("gen");
  });
});

describe("auditCoverage sensor", () => {
  const sensor = SENSORS.find((s) => s.id === "auditCoverage");
  const makeRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "audit-coverage-"));
    mkdirSync(join(root, "metrics"));
    return root;
  };

  it("names the missing committed summary", () => {
    expect(sensor.collect({ root: makeRoot() })).toEqual({
      available: false,
      reason: "summary_missing",
    });
  });

  it("reports zones never recorded from the committed rows", () => {
    const root = makeRoot();
    writeFileSync(join(root, "metrics", ".keep"), "");
    append(
      "audit-coverage",
      buildAuditCoverageRow([{ url: gen.url, code: "200" }], meta, SURFACE_REGISTRY),
      {
        root,
      }
    );
    const data = sensor.collect({ root });
    expect(data.available).toBe(true);
    expect(data.zones_never_recorded).not.toContain("gen");
    expect(data.zones_never_recorded).toContain("api:users");
    expect(sensor.format(data, "auditCoverage")).toContain("never recorded");
  });
});

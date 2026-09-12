/**
 * Tests for the edge_requests Analytics Engine contract module.
 *
 * The one assertion that matters is positional: every field toDataPoint()
 * emits must sit at the blob/double index EDGE_REQUESTS_COLUMNS declares,
 * because scripts/edge-usage.mjs reads those columns back by that map.
 * Positions are derived from the map inside the test — never copied from the
 * module — so the two cannot agree by copy-paste.
 */

import { describe, it, expect } from "vitest";
import {
  ANALYTICS_BINDING,
  EDGE_REQUESTS_DATASET,
  EDGE_REQUESTS_COLUMNS,
  toDataPoint,
} from "./analytics-schema.js";

const COLUMN_PATTERN = /^(blob|double)(\d+)$/;

describe("analytics-schema", () => {
  it("names the binding and dataset that wrangler.toml and Pulumi must agree on", () => {
    expect(ANALYTICS_BINDING).toBe("ANALYTICS");
    expect(EDGE_REQUESTS_DATASET).toBe("edge_requests");
  });

  it("documents the edge_requests column layout", () => {
    expect(EDGE_REQUESTS_COLUMNS).toEqual({
      route: "blob1",
      method: "blob2",
      country: "blob3",
      pathname: "blob4",
      status: "double1",
      elapsedMs: "double2",
      index: "route",
    });
  });

  it("toDataPoint places every field at the position its declared column implies", () => {
    const input = {
      route: "rialto",
      method: "GET",
      country: "US",
      pathname: "/rialto/components/button",
      status: 200,
      elapsedMs: 42,
    };
    const point = toDataPoint(input);

    const positional = Object.entries(EDGE_REQUESTS_COLUMNS).filter(([field]) => field !== "index");
    expect(positional.length).toBeGreaterThan(0);
    for (const [field, column] of positional) {
      const match = COLUMN_PATTERN.exec(column);
      expect(match, `${field} → ${column} is not a blobN/doubleN column`).not.toBeNull();
      const values = match[1] === "blob" ? point.blobs : point.doubles;
      expect(values[Number(match[2]) - 1], `${field} at ${column}`).toBe(input[field]);
    }
    expect(point.indexes).toEqual([input[EDGE_REQUESTS_COLUMNS.index]]);
  });

  // The input is a shape fixture: only the three lengths below are asserted,
  // so no value here is read. Kept off an /api/... string literal on purpose —
  // the hardcodedRoutes ratchet scans test files (consoleLogs does not), and a
  // decorative literal would spend a repo-wide budget for nothing.
  it("toDataPoint emits exactly the declared columns and one index", () => {
    const point = toDataPoint({
      route: "hospitality",
      method: "POST",
      country: "unknown",
      pathname: "/hospitality/reservations",
      status: 503,
      elapsedMs: 0,
    });
    const columns = Object.values(EDGE_REQUESTS_COLUMNS).filter((c) => COLUMN_PATTERN.test(c));

    expect(point.blobs).toHaveLength(columns.filter((c) => c.startsWith("blob")).length);
    expect(point.doubles).toHaveLength(columns.filter((c) => c.startsWith("double")).length);
    expect(point.indexes).toHaveLength(1);
  });
});

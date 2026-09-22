/**
 * The guard.
 *
 * Every `method + path` `@mbe/api-client` can emit must be answered by one of
 * the four route owners. No allowlist, no skip.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { buildRouteContractReport, unownedVerdicts, formatUnowned } from "./route-contract.js";
import type { RouteContractReport } from "./route-contract.js";

let report: RouteContractReport;

beforeAll(async () => {
  report = await buildRouteContractReport();
});

describe("route contract", () => {
  it("has a route owner for every client pair", () => {
    const unowned = unownedVerdicts(report.verdicts);

    expect(formatUnowned(unowned)).toBe("");
  });
});

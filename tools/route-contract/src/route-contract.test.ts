/**
 * The guard.
 *
 * Every `method + path` `@mbe/api-client` can emit must be answered by one of
 * the four route owners — the three Fastify services or the edge Worker. No
 * allowlist, no skip.
 *
 * The second assertion is not decoration. "Every client pair has an owner" is
 * trivially true of a run that found no client pairs, so this suite also
 * asserts it measured something. See `vacuity.ts`; every clause there is
 * exercised against an emptied input in `vacuity.test.ts`.
 */
import { describe, it, expect, beforeAll } from "vitest";

import {
  buildRouteContractReport,
  unownedVerdicts,
  formatUnowned,
  vacuityInputFromReport,
} from "./route-contract.js";
import type { RouteContractReport } from "./route-contract.js";
import { vacuityFailures } from "./vacuity.js";

let report: RouteContractReport;

beforeAll(async () => {
  report = await buildRouteContractReport();
});

describe("route contract", () => {
  it("measured something — the verdict below cannot pass vacuously", () => {
    expect(vacuityFailures(vacuityInputFromReport(report))).toEqual([]);
  });

  it("has a route owner for every client pair", () => {
    const unowned = unownedVerdicts(report.verdicts);

    expect(formatUnowned(unowned)).toBe("");
  });
});

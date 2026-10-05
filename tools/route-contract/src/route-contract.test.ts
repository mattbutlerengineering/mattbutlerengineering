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
import {
  PARITY_DOMAINS,
  schemaParityReport,
  parityVacuityFailures,
  formatParityFailures,
} from "./route-contract.js";
import { KNOWN_PARITY_GAPS } from "./known-parity-gaps.js";
import { PLACEHOLDER } from "./types.js";

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

describe("findings this guard produced on its first run", () => {
  // Both were 404 in production and invisible to every other gate. Pinned
  // here so the fixes cannot silently regress — a path that goes back to
  // being unowned would already fail the verdict above, but these say which
  // owner is the right one, which the verdict alone does not.

  it("Finding A — HealthClient.system is answered by the edge, not forwarded to DO", () => {
    const verdict = report.verdicts.find((v) => v.pair.producedBy.includes("health.system"));

    expect(verdict?.pair.path).toBe("/health/system");
    expect(verdict?.edgeDisposition).toBe("edge-terminal");
    expect(verdict?.owners).toEqual(["edge"]);
  });

  it("Finding B — no client method reaches the unregistered venue-group by-slug path", () => {
    const groupBySlug = report.verdicts.filter((v) =>
      v.pair.path.startsWith("/api/v1/venues/groups/by-slug")
    );

    expect(groupBySlug).toEqual([]);
  });

  it("Finding B — the venue by-slug path the apps actually call is untouched", () => {
    // Deleting VenueGroupsClient.getBySlug must not have taken the VENUE
    // client's own getBySlug with it: apps/hospitality calls that one from
    // three places (useVenues.ts, VenueOnboardingPage.tsx, PublicBookingPage.tsx).
    const verdict = report.verdicts.find((v) => v.pair.producedBy.includes("venues.getBySlug"));

    expect(verdict?.pair.path).toBe(`/api/v1/venues/by-slug/${PLACEHOLDER}`);
    expect(verdict?.owners).toEqual(["reservations"]);
  });
});

describe("schema parity — client-declared vs route-registered body, query and response", () => {
  it("compared something in every parity domain", () => {
    const parity = schemaParityReport(report, PARITY_DOMAINS);
    expect(parityVacuityFailures(parity, PARITY_DOMAINS)).toEqual([]);
  });

  it("finds exactly the pinned known gaps — a new drift and an accidental fix both fail", () => {
    const parity = schemaParityReport(report, PARITY_DOMAINS);
    const measured = parity.failures.map((f) => `${f.clientMethod} ${f.facet}`).sort();

    expect(measured, formatParityFailures(parity.failures)).toEqual([...KNOWN_PARITY_GAPS].sort());
  });
});

/**
 * Every anti-vacuity clause, exercised against a deliberately emptied input.
 *
 * A clause asserted only in prose is exactly the decoration this file exists
 * to prevent, so each one is run here with the source it guards emptied out,
 * and the message it produces is pinned.
 */
import { describe, it, expect } from "vitest";

import { vacuityFailures, MINIMUM_CLIENT_PAIRS } from "./vacuity.js";
import type { VacuityInput } from "./vacuity.js";

/** A healthy input, deliberately close to the real measured one. */
const HEALTHY: VacuityInput = {
  pairCount: MINIMUM_CLIENT_PAIRS,
  subClientPairCounts: { users: 7, reservations: 10, health: 1 },
  silentClientMethods: [],
  ownerTableSizes: { reservations: 176, users: 44, agent: 56, edge: 5 },
};

describe("vacuityFailures", () => {
  it("passes a healthy input", () => {
    expect(vacuityFailures(HEALTHY)).toEqual([]);
  });

  it("fails when the client inventory is empty", () => {
    const failures = vacuityFailures({ ...HEALTHY, pairCount: 0 });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("the client inventory is empty");
  });

  it("fails when the inventory has narrowed below the measured floor", () => {
    // The dangerous shape: not empty, just smaller. A driver that drops most
    // of the roster still finds an owner for the handful it kept, so the
    // guard's own assertion stays green.
    const failures = vacuityFailures({ ...HEALTHY, pairCount: MINIMUM_CLIENT_PAIRS - 1 });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain(`below the measured floor of ${MINIMUM_CLIENT_PAIRS}`);
  });

  it("fails when a roster sub-client contributed zero pairs", () => {
    const failures = vacuityFailures({
      ...HEALTHY,
      subClientPairCounts: { ...HEALTHY.subClientPairCounts, health: 0 },
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("sub-client(s) contributed no pairs: health");
  });

  it("fails when a non-exempt client method issued no request", () => {
    const failures = vacuityFailures({
      ...HEALTHY,
      silentClientMethods: ["floorPlans.setActive"],
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("issued no request: floorPlans.setActive");
  });

  it.each(["reservations", "users", "agent", "edge"])(
    "fails when the %s owner table is empty",
    (owner) => {
      const failures = vacuityFailures({
        ...HEALTHY,
        ownerTableSizes: { ...HEALTHY.ownerTableSizes, [owner]: 0 },
      });

      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain(`route owner table(s) are empty: ${owner}`);
    }
  );

  it("reports every independent failure at once", () => {
    // Not one-at-a-time by construction: a run that has genuinely collapsed
    // should say so in full rather than hide three problems behind the first.
    const failures = vacuityFailures({
      pairCount: 0,
      subClientPairCounts: { users: 0 },
      silentClientMethods: ["venues.get"],
      ownerTableSizes: { reservations: 0, users: 0, agent: 0, edge: 0 },
    });

    expect(failures).toHaveLength(4);
  });
});

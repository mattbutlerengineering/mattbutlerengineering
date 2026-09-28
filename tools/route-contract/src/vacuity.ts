/**
 * The anti-vacuity contract — the part that decides whether this is a gate or
 * a decoration.
 *
 * The guard's own assertion ("every client pair has an owner") is trivially
 * satisfiable by having no client pairs. So is "no client method issued
 * nothing" if nothing was driven, and so is the whole join if an owner table
 * came back empty. Each of those is a plausible regression — a driver that
 * throws early, a roster entry that stops constructing, a `buildApp` that
 * silently registers no routes — and each would make the suite GREENER, which
 * is the direction nobody investigates.
 *
 * Modelled on `infrastructure/pulumi/ingress-coverage.test.ts:164` ("reads
 * real values from every source, so nothing below can pass vacuously"). This
 * repo has recorded the same class repeatedly: a Playwright spec no workflow
 * invoked, a `check-*` script wired into nothing, two metrics collectors that
 * ran daily and produced zero rows for months. Absence renders identically to
 * fine unless something asserts presence.
 *
 * Pure and input-shaped on purpose: every clause below is exercised by a
 * negative test that feeds it a deliberately emptied input, rather than
 * asserted in prose.
 */

/**
 * The surface the client actually emits. A lower bound, not an equality —
 * adding a client method must not break the suite, but a driver that drops
 * most of the roster and still finds an owner for the handful it kept must.
 *
 * Measured 87 at `origin/main` `0a80ea85b`. Lowered to 86 in the same run,
 * deliberately: deleting the dead `VenueGroupsClient.getBySlug` (Finding B,
 * `docs/fixes/api-client-route-contract/`) removed one real pair, and this
 * floor caught the drop the moment it happened — which is the point. Lowering
 * it is the only correct response to a surface that legitimately shrank, and
 * it must stay a conscious edit with a reason attached, never a number
 * recomputed from whatever the driver last produced.
 *
 * That rule used to be prose only: every assertion on this constant was
 * relative to the constant itself, so lowering it to 20 left all 66 tests
 * green (measured 2026-09-22). `vacuity.test.ts` now also pins it against an
 * absolute floor, so a lowering past that floor is a second, deliberate edit.
 */
export const MINIMUM_CLIENT_PAIRS = 86;

export interface VacuityInput {
  /** Distinct `method + path` pairs the driver produced. */
  readonly pairCount: number;
  /** Pairs contributed per roster sub-client. */
  readonly subClientPairCounts: Readonly<Record<string, number>>;
  /** Non-exempt client methods that issued no request in their own invocation. */
  readonly silentClientMethods: readonly string[];
  /** Registered entries per route owner: three Fastify tables plus the edge's. */
  readonly ownerTableSizes: Readonly<Record<string, number>>;
}

/**
 * Every way this suite could pass while having measured nothing. Empty means
 * the guard's verdict is worth something.
 */
export function vacuityFailures(input: VacuityInput): string[] {
  const failures: string[] = [];

  if (input.pairCount === 0) {
    failures.push("the client inventory is empty — the driver produced no pairs at all");
  } else if (input.pairCount < MINIMUM_CLIENT_PAIRS) {
    failures.push(
      `the client inventory holds ${input.pairCount} pairs, below the measured floor of ` +
        `${MINIMUM_CLIENT_PAIRS} — the driver has narrowed`
    );
  }

  const emptySubClients = Object.entries(input.subClientPairCounts)
    .filter(([, count]) => count === 0)
    .map(([name]) => name);
  if (emptySubClients.length > 0) {
    failures.push(`sub-client(s) contributed no pairs: ${emptySubClients.join(", ")}`);
  }

  if (input.silentClientMethods.length > 0) {
    failures.push(
      `non-exempt client method(s) issued no request: ${input.silentClientMethods.join(", ")}`
    );
  }

  const emptyOwners = Object.entries(input.ownerTableSizes)
    .filter(([, size]) => size === 0)
    .map(([name]) => name);
  if (emptyOwners.length > 0) {
    failures.push(`route owner table(s) are empty: ${emptyOwners.join(", ")}`);
  }

  return failures;
}

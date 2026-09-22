/**
 * The join: every `method + path` `@mbe/api-client` can emit, against every
 * route owner that could answer it.
 *
 * One-directional, client → owner. A registered route with no client caller is
 * not a failure and is not reported: there are ~276 registered method+path
 * entries against 87 client pairs, and most of the difference is legitimately
 * called by something other than this client (`/api/v1/stripe/webhook`,
 * `/api/v1/events/stream`, `/v1/orchestrate`, `/v1/webhooks/*`, `/api/gen/*`,
 * cron and ops paths) or is Fastify's own auto-registered `HEAD`/`OPTIONS`. A
 * reverse rule would need a ~190-entry allowlist — the same escape hatch this
 * design rejected, pointed backwards.
 *
 * There is no allowlist and no skip in this direction either. A client pair
 * that no owner answers is a 404 in production with every other gate green,
 * which is the condition this run exists to end.
 */
import { bootFastifyOwners, FASTIFY_OWNERS } from "./fastify-owners.js";
import type { FastifyOwner } from "./fastify-owners.js";
import { createEdgeOwner, EDGE_TERMINAL_PATHS } from "./edge-owner.js";
import { driveClient } from "./client-inventory.js";
import type { ClientInventory } from "./client-inventory.js";
import type { ClientPair, EdgeDisposition, Owner } from "./types.js";

export interface Verdict {
  readonly pair: ClientPair;
  /** Every owner that answers this pair. Empty is the failure. */
  readonly owners: readonly Owner[];
  readonly edgeDisposition: EdgeDisposition;
}

export interface RouteContractReport {
  readonly verdicts: readonly Verdict[];
  readonly inventory: ClientInventory;
  /** Registered method+path entries per Fastify owner — the anti-vacuity signal. */
  readonly fastifyRouteCounts: Readonly<Record<FastifyOwner, number>>;
  /** Paths the edge terminates itself — the same signal for the fourth owner. */
  readonly edgeTerminalPathCount: number;
}

/**
 * Boots all four owners, drives the client, joins the two, and shuts the
 * Fastify apps down again. Everything happens in one process, in one test run;
 * nothing settles later.
 */
export async function buildRouteContractReport(): Promise<RouteContractReport> {
  const inventory = await driveClient();
  const fastify = await bootFastifyOwners();
  const edge = createEdgeOwner();

  try {
    const verdicts: Verdict[] = [];

    for (const pair of inventory.pairs) {
      const probe = await edge.classify(pair.method, pair.path);
      const owners: Owner[] = [...fastify.ownersOf(pair.method, pair.path)];

      // Forwarding to DO is NOT ownership — a Fastify service still has to
      // answer. Only a path the edge terminates makes the edge an owner.
      if (probe.disposition === "edge-terminal") owners.push("edge");

      verdicts.push({ pair, owners, edgeDisposition: probe.disposition });
    }

    const fastifyRouteCounts = Object.fromEntries(
      FASTIFY_OWNERS.map((owner) => [owner, fastify.routeCount(owner)])
    ) as Record<FastifyOwner, number>;

    return {
      verdicts,
      inventory,
      fastifyRouteCounts,
      edgeTerminalPathCount: EDGE_TERMINAL_PATHS.length,
    };
  } finally {
    await fastify.close();
  }
}

/** The failures: client pairs nothing answers. */
export function unownedVerdicts(verdicts: readonly Verdict[]): Verdict[] {
  return verdicts.filter((verdict) => verdict.owners.length === 0);
}

/**
 * The failure message.
 *
 * It has to be actionable on its own, because the person reading it is looking
 * at a red CI job and not at this file. Per unowned pair it names the method,
 * the path, the client method that produced it, and what the edge does with it
 * — the last of which is usually the whole diagnosis (`forwarded-to-origin`
 * means "you expected a service to answer and none does"; `static-spa` means
 * "the apex serves the marketing site here").
 */
export function formatUnowned(unowned: readonly Verdict[]): string {
  if (unowned.length === 0) return "";

  const lines = unowned.map((verdict) =>
    [
      `  ${verdict.pair.method} ${verdict.pair.path}`,
      `      produced by:  ${verdict.pair.producedBy.join(", ")}`,
      `      edge:         ${verdict.edgeDisposition}`,
      `      fastify:      no match in ${FASTIFY_OWNERS.join(", ")}`,
    ].join("\n")
  );

  return [
    `${unowned.length} @mbe/api-client pair(s) have no route owner:`,
    "",
    ...lines,
    "",
    "A client URL with no route to answer it is a 404 in production with every",
    "other gate green. Fix the client literal, or register the route — do not",
    "add an allowlist here.",
  ].join("\n");
}

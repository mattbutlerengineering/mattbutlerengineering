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
import type { VacuityInput } from "./vacuity.js";
import { toRequestJsonSchema, toResponseJsonSchema } from "@mbe/types";
import { compareFacet, refTableFromOpenApi, routeFacets } from "./schema-parity.js";
import type { Facet, JsonSchema, OpenApiOperation } from "./schema-parity.js";

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
  /** Each Fastify owner's `app.swagger()` document, read before the apps close. */
  readonly openApiDocuments: Readonly<Record<FastifyOwner, unknown>>;
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

    const openApiDocuments = Object.fromEntries(
      FASTIFY_OWNERS.map((owner) => [owner, fastify.openApiDocument(owner)])
    ) as Record<FastifyOwner, unknown>;

    return {
      verdicts,
      inventory,
      fastifyRouteCounts,
      edgeTerminalPathCount: EDGE_TERMINAL_PATHS.length,
      openApiDocuments,
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

/**
 * Reshapes a report into the anti-vacuity input. Every field is read off real
 * measured state — nothing here has a default that could paper over an empty
 * source.
 */
export function vacuityInputFromReport(report: RouteContractReport): VacuityInput {
  return {
    pairCount: report.inventory.pairs.length,
    subClientPairCounts: Object.fromEntries(
      report.inventory.subClients.map((name) => [name, report.inventory.pairCount(name)])
    ),
    silentClientMethods: report.inventory.invocations
      .filter((invocation) => !invocation.exempt && invocation.requestCount === 0)
      .map((invocation) => invocation.clientMethod),
    ownerTableSizes: { ...report.fastifyRouteCounts, edge: report.edgeTerminalPathCount },
  };
}

// ── Schema parity ─────────────────────────────────────────────

/**
 * Sub-client domains whose body / query / response schemas are compared with
 * the owning route's. This is the coexistence seam of the endpoint-definition
 * migration (docs/fixes/endpoint-definitions-pilot): a domain joins this list
 * when it is guarded, and the list only grows. Every listed domain is owned by
 * the reservations service today.
 */
export const PARITY_DOMAINS = ["guests"] as const;

const PARITY_OWNER: FastifyOwner = "reservations";

export interface ParityFailure {
  readonly clientMethod: string;
  readonly method: string;
  readonly path: string;
  readonly facet: Facet | "route";
  readonly detail: string;
}

export interface SchemaParityReport {
  readonly failures: readonly ParityFailure[];
  /** Compared captures per domain — the anti-vacuity signal. */
  readonly comparedPerDomain: Readonly<Record<string, number>>;
}

export interface OpenApiDocument {
  readonly paths?: Record<string, Record<string, OpenApiOperation>>;
  readonly components?: { readonly schemas?: unknown };
}

const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * The swagger operation documenting a concrete client path. Templates are
 * matched segment-wise (`{id}` matches any one segment) and a static template
 * wins over a parameterised one — `/guests/lapsing` over `/guests/{id}`, the
 * same precedence find-my-way applies. Trailing slashes are ignored: Fastify
 * documents a prefixed `"/"` route with a trailing slash (the guests list).
 */
export function findOperation(
  doc: OpenApiDocument,
  method: string,
  path: string
): OpenApiOperation | undefined {
  const wanted = trimSlash(path).split("/");
  const candidates = Object.entries(doc.paths ?? {})
    .map(([template, item]) => ({ segments: trimSlash(template).split("/"), item }))
    .filter(
      ({ segments }) =>
        segments.length === wanted.length &&
        segments.every((seg, i) => /^\{.+\}$/.test(seg) || seg === wanted[i])
    )
    .sort(
      (a, b) =>
        a.segments.filter((seg) => seg.startsWith("{")).length -
        b.segments.filter((seg) => seg.startsWith("{")).length
    );
  for (const { item } of candidates) {
    const operation = item[method.toLowerCase()];
    if (operation) return operation;
  }
  return undefined;
}

/**
 * Compares every captured request in `domains` with its owning route. Client
 * Zod is converted with the same helpers the server derives route schemas
 * with, so a difference is a real contract difference, not a translation one.
 */
export function schemaParityReport(
  report: RouteContractReport,
  domains: readonly string[]
): SchemaParityReport {
  const doc = (report.openApiDocuments[PARITY_OWNER] ?? {}) as OpenApiDocument;
  const refs = refTableFromOpenApi(doc);
  const failures: ParityFailure[] = [];
  const comparedPerDomain: Record<string, number> = Object.fromEntries(domains.map((d) => [d, 0]));

  for (const capture of report.inventory.schemaCaptures) {
    if (!domains.includes(capture.subClient)) continue;
    comparedPerDomain[capture.subClient] = (comparedPerDomain[capture.subClient] ?? 0) + 1;
    const where = {
      clientMethod: capture.clientMethod,
      method: capture.method,
      path: capture.path,
    };

    const operation = findOperation(doc, capture.method, capture.path);
    if (!operation) {
      failures.push({ ...where, facet: "route", detail: "no OpenAPI operation documents it" });
      continue;
    }
    const route = routeFacets(operation);
    const def = capture.definition;
    const client: Partial<Record<Facet, JsonSchema>> = {
      body: def?.body ? toRequestJsonSchema(def.body) : undefined,
      query: def?.query ? toRequestJsonSchema(def.query) : undefined,
      response: capture.response ? toResponseJsonSchema(capture.response) : undefined,
    };
    for (const facet of ["body", "query", "response"] as const) {
      const mismatch = compareFacet(facet, client[facet], route[facet], refs);
      if (mismatch) failures.push({ ...where, ...mismatch });
    }
  }

  return { failures, comparedPerDomain };
}

/** A parity domain that compared nothing would pass vacuously — that is a failure. */
export function parityVacuityFailures(
  parity: SchemaParityReport,
  domains: readonly string[]
): string[] {
  return domains
    .filter((domain) => (parity.comparedPerDomain[domain] ?? 0) === 0)
    .map((domain) => `parity domain "${domain}" produced no schema captures`);
}

/** The failure message: one line per mismatch, naming method, path, facet and pointer. */
export function formatParityFailures(failures: readonly ParityFailure[]): string {
  return failures
    .map((f) => `${f.clientMethod}  ${f.method} ${f.path}  [${f.facet}] ${f.detail}`)
    .join("\n");
}

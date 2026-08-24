/**
 * Ingress coverage: every path prefix a service actually registers must have
 * a DO App Platform ingress rule that routes it to that service.
 *
 * Lives in its own file rather than index.test.ts because that file mocks
 * `node:fs` (to stub the Cloudflare Worker script), which would make every
 * read here return the stub instead of real source.
 *
 * Why this exists: index.test.ts already asserts the SHAPE of the ingress
 * rules — ordering, preservePathPrefix, every service referenced — but never
 * their COVERAGE. That gap shipped. `services/reservations` registers its
 * public booking-widget and guest-self-service routes under `/public/v1/...`,
 * no rule matched `/public`, so every one of them fell through to the `/`
 * catch-all, landed on users-api, and answered Fastify's default 404. The
 * whole surface was unreachable in production while every unit test passed —
 * an ingress rule that is absent looks exactly like one that is present until
 * you curl the deployed host.
 *
 * The prefixes are read out of the real source on both sides so that adding a
 * route prefix without an ingress rule fails here, instead of 404ing silently
 * in production.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// `__dirname`, not `import.meta.url`: this package compiles to CommonJS
// (tsc rejects import.meta here with TS1470), and __dirname is native there.
const read = (rel: string): string => readFileSync(resolve(__dirname, rel), "utf8");

/** Capture group 1 of every match, with the undefined-capture case dropped. */
const captures = (source: string, re: RegExp): string[] =>
  [...source.matchAll(re)].map((m) => m[1]).filter((v): v is string => v !== undefined);

const SERVICES = ["users", "reservations", "agent"] as const;

/**
 * Every absolute path the services actually serve.
 *
 * Two sources, because there are two ways a route gets its path here:
 *  - `fastify.register(x, { prefix: "..." })` in app.ts, and
 *  - plugins registered with NO prefix, which declare the full path inline
 *    (`confirmAttendance`, `manageReservation`, `publicUnsubscribe`, ...).
 * Reading only the first misses six reservations plugins — including
 * `/public/v1/reservations/manage` and `/public/v1/guests/unsubscribe`, the
 * guest-facing links that ship in outbound email.
 *
 * Test files are excluded: their fixture paths are not served by anything, and
 * letting them in would make an unrelated test able to fail this one.
 */
function servedPaths(): string[] {
  const paths = new Set<string>();
  for (const service of SERVICES) {
    const appSource = read(`../../services/${service}/src/app.ts`);
    for (const prefix of captures(appSource, /prefix:\s*"([^"]+)"/g)) paths.add(prefix);

    const routesDir = resolve(__dirname, `../../services/${service}/src/routes`);
    for (const file of readdirSync(routesDir)) {
      if (!file.endsWith(".ts") || file.includes(".test.")) continue;
      const source = readFileSync(resolve(routesDir, file), "utf8");
      for (const p of captures(source, /"(\/(?:api|public|v1)[a-zA-Z0-9/:_.-]*)"/g)) paths.add(p);
    }
  }
  return [...paths];
}

/** Path prefixes the DO App Platform ingress actually routes. */
function ingressPrefixes(): string[] {
  const source = read("./index.ts");
  const block = source.match(/ingress:\s*\{[\s\S]*?\n {6}\},/);
  if (!block) throw new Error("could not locate the ingress block in index.ts");
  return captures(block[0], /prefix:\s*"([^"]+)"/g);
}

/**
 * Every `ignoreChanges` property path declared on the `digitalocean.App`
 * resource — read from real source, because this is the field that decides
 * whether anything above it is more than decoration.
 */
function appIgnoreChanges(): string[] {
  const source = read("./index.ts");
  const entries = source.match(/ignoreChanges:\s*\[([^\]]*)\]/)?.[1];
  if (entries === undefined)
    throw new Error("could not locate the ignoreChanges array in index.ts");
  return captures(entries, /"([^"]*)"/g);
}

/**
 * Path prefixes the Cloudflare edge worker proxies to the DO origin.
 *
 * The second gate. Reading only the DO side is what let this one hide: the
 * shipped `apps/hospitality` bundle is built with
 * `VITE_API_URL: https://mattbutlerengineering.com` (deploy-static.yml), so a
 * guest's request meets the edge worker first. If the edge does not forward a
 * prefix, a perfect DO ingress rule behind it is unreachable — measured
 * 2026-08-24: `GET https://mattbutlerengineering.com/public/v1/venues/x`
 * answered `200 text/html`, the marketing site, never leaving Cloudflare.
 */
function originRoutePrefixes(): string[] {
  const config: unknown = JSON.parse(read("../worker/routes-config.json"));
  const routes = (config as { originRoutes?: unknown }).originRoutes;
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error(
      "the Cloudflare edge gate has no source of truth: " +
        'infrastructure/worker/routes-config.json declares no "originRoutes" array, so ' +
        "nothing here can tell which prefixes edge-router.js forwards to API_ORIGIN. The " +
        "edge currently proxies only /api/, which means /public/v1/** dies at the edge " +
        "even when DO ingress routes it correctly."
    );
  }
  return routes.filter((p): p is string => typeof p === "string");
}

/**
 * Served prefixes deliberately NOT reachable through the Cloudflare edge.
 *
 * `agent-api`'s `/v1/*` surface (sessions, orchestrate, webhooks) is addressed
 * directly on `api.mattbutlerengineering.com`; no browser bundle calls it via
 * the apex, and at the apex those paths serve the marketing SPA today. Adding
 * them to `originRoutes` would change what a live path returns, which this run
 * has no defect against and no authorization for.
 *
 * An exemption list is a hole in the check, so it is named rather than
 * implied — and the test below refuses to let it grow over either gate this
 * run exists to open.
 */
const EDGE_EXEMPT_PREFIXES = ["/v1"] as const;

/** Whether a prefix covers a path the way the edge router matches: exact, or a whole segment below. */
const coversPath = (prefix: string, path: string): boolean =>
  path === prefix || path.startsWith(`${prefix}/`);

/**
 * Whether an `ignoreChanges` property path makes the ingress rules unmanaged.
 *
 * True for `spec` (an ancestor), for `spec.ingress` itself, and for anything
 * below it (`spec.ingress.rules`): all three tell the engine not to diff the
 * rules, and an undiffed rule is a rule that cannot ship.
 */
function swallowsIngress(path: string): boolean {
  const INGRESS = "spec.ingress";
  return path === INGRESS || INGRESS.startsWith(`${path}.`) || path.startsWith(`${INGRESS}.`);
}

describe("Ingress coverage", () => {
  it("reads real values from every source, so nothing below can pass vacuously", () => {
    // Guards the readers themselves: a parse that silently matches nothing
    // would make every assertion below vacuously true, which is the same
    // class of defect this file exists to catch. Each reader is asserted
    // separately, and each throws inside the assertion that uses it rather
    // than at module scope — so one unreadable source fails one test instead
    // of erroring the whole file and taking the other gate's check with it.
    expect(servedPaths().length).toBeGreaterThan(0);
    expect(ingressPrefixes().length).toBeGreaterThan(0);
    // A reader that returned [] here would make the edge-coverage assertion
    // trivially satisfied — every path "covered" by a table of nothing.
    expect(originRoutePrefixes().length).toBeGreaterThan(0);
    // And one that returned [] here would report the ingress rules managed
    // no matter what index.ts actually ignores.
    expect(appIgnoreChanges().length).toBeGreaterThan(0);
  });

  it("every path a service serves is covered by a non-catch-all ingress rule", () => {
    // The `/` catch-all matches everything, so it cannot count as coverage —
    // it is precisely what made the `/public/v1` failure silent.
    const routable = ingressPrefixes().filter((p) => p !== "/");
    const uncovered = servedPaths().filter((route) => !routable.some((p) => route.startsWith(p)));
    expect(uncovered).toEqual([]);
  });

  it("every path a service serves is also forwarded by the Cloudflare edge", () => {
    // The second gate, in series with the first. Both are shut today and
    // opening either alone changes nothing a user can observe: the DO ingress
    // rule is only consulted once the request reaches DigitalOcean, and the
    // edge worker is what decides whether it ever does.
    const exempt = EDGE_EXEMPT_PREFIXES;
    const proxied = originRoutePrefixes();
    const uncovered = servedPaths().filter(
      (route) =>
        !exempt.some((p) => coversPath(p, route)) && !proxied.some((p) => coversPath(p, route))
    );
    expect(
      uncovered,
      `these paths are served by a service and routed by DO ingress, but the Cloudflare ` +
        `edge worker does not forward them to API_ORIGIN — originRoutes is ` +
        `${JSON.stringify(proxied)}. A request from the shipped browser bundle dies at the ` +
        `edge and never reaches DigitalOcean, so the DO rule behind it is unreachable.`
    ).toEqual([]);
  });

  it("never exempts a prefix from the edge gate that this run exists to open", () => {
    // The exemption list is the one way assertion A can be made vacuously
    // true. `/api` and `/public` are the two prefixes the edge must forward;
    // exempting either would silently restore the defect while the check
    // above stayed green.
    const overreaching = EDGE_EXEMPT_PREFIXES.filter(
      (p) => coversPath(p, "/api") || coversPath(p, "/public")
    );
    expect(overreaching).toEqual([]);
  });

  it("keeps the ingress rules managed, so a rule in source can reach production", () => {
    // The assertion whose absence made this whole file vacuous. Every rule
    // above can be present and correct in source and still never ship: the
    // App resource carried `ignoreChanges: ["spec"]`, which tells Pulumi to
    // diff none of the spec — ingress included. The rule was right, the
    // resource was configured to ignore it, and nothing anywhere connected
    // those two facts. `pulumi up` then reported success with the App
    // `unchanged`, three times over three months, while /public/v1/** 404ed.
    const swallowing = appIgnoreChanges().filter(swallowsIngress);
    expect(
      swallowing,
      `ignoreChanges: ${JSON.stringify(appIgnoreChanges())} on the digitalocean.App resource ` +
        `makes spec.ingress unmanaged, so no ingress rule written in index.ts can reach ` +
        `production — a green "pulumi up" means the App was left unchanged, not that the ` +
        `rule shipped. Narrow it to ingress's siblings (spec.features, spec.jobs, ` +
        `spec.services) so the rules above are diffed again.`
    ).toEqual([]);
  });

  it("routes the public surface to the service that implements it", () => {
    // Named explicitly, not just covered: `/public/v1/*` exists only in
    // reservations, and the catch-all sends unmatched paths to users-api.
    const source = read("./index.ts");
    const publicRule = source.match(
      /match:\s*\{\s*path:\s*\{\s*prefix:\s*"\/public"\s*\}\s*\},\s*component:\s*\{\s*name:\s*"([^"]+)"/
    );
    expect(publicRule?.[1]).toBe("reservations-api");
  });
});

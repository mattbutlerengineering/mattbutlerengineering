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

describe("Ingress coverage", () => {
  it("reads real prefixes from both sides", () => {
    // Guards the regexes themselves: a parse that silently matches nothing
    // would make every assertion below vacuously true, which is the same
    // class of defect this file exists to catch.
    expect(servedPaths().length).toBeGreaterThan(0);
    expect(ingressPrefixes().length).toBeGreaterThan(0);
  });

  it("every path a service serves is covered by a non-catch-all ingress rule", () => {
    // The `/` catch-all matches everything, so it cannot count as coverage —
    // it is precisely what made the `/public/v1` failure silent.
    const routable = ingressPrefixes().filter((p) => p !== "/");
    const uncovered = servedPaths().filter((route) => !routable.some((p) => route.startsWith(p)));
    expect(uncovered).toEqual([]);
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

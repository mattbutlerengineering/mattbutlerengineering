/**
 * Edge-worker route-owner adapter.
 *
 * Calls the real Worker module's `fetch` with a stub environment and asks what
 * it did with the path. The edge is a first-class fourth route owner: it
 * answers the five `/health/*` aggregation paths itself and answers nothing
 * else, forwarding `/api` and `/public` to DO and handing everything else to
 * the marketing SPA.
 *
 * **Classification is by the RETURNED response, never by which stub fired.**
 * That is the trap this adapter exists to design around, and it is measured,
 * not theoretical: `handleHealthSystem` legitimately fans out through both the
 * origin `fetch` (to probe each service's health path) and the static bindings
 * (to probe each SPA) as part of doing its job
 * (`infrastructure/worker/edge-router.js:147-149` →
 * `infrastructure/worker/health/system.js`). A "which spy was called" oracle
 * therefore reports `/health/system` as `static-spa` — the exact opposite of
 * the truth, and in the direction that hides a defect. Tagging the stub
 * responses with a header and reading it off what the router hands back gets
 * every probe right; `edge-owner.test.ts` asserts the trap explicitly rather
 * than trusting this comment.
 *
 * Why vitest and not a script: `edge-router.js:24` does
 * `import topologyConfig from "./routes-config.json"` with no import
 * attribute, which bare Node refuses (`ERR_IMPORT_ATTRIBUTE_MISSING`). Do not
 * "fix" that by rewriting the import — it is production code, and vite
 * resolves it as-is.
 */
import edgeRouter from "@mbe/edge-worker/edge-router.js";

import type { EdgeDisposition, HttpMethod } from "./types.js";

/** Header the stubs tag their responses with, read back off the router's return value. */
const PROBE_HEADER = "x-route-contract-probe";

const APEX = "https://mattbutlerengineering.com";

/** The static-asset Service Bindings `routes-config.json` declares. */
const STATIC_BINDINGS = ["MARKETING", "HOSPITALITY", "RIALTO", "GEN"] as const;

export interface EdgeProbe {
  readonly disposition: EdgeDisposition;
  /**
   * Diagnostics, deliberately reported alongside the verdict and deliberately
   * NOT used to reach it — see the module comment. The anti-trap test is the
   * one consumer.
   */
  readonly originFetchCalls: number;
  readonly staticBindingCalls: number;
}

export interface EdgeOwner {
  classify(method: HttpMethod, path: string): Promise<EdgeProbe>;
  /** True only for `edge-terminal`: forwarding to DO makes a *service* the owner. */
  answers(method: HttpMethod, path: string): Promise<boolean>;
  /** The paths the edge terminates itself — the anti-vacuity signal for this owner. */
  readonly terminalPaths: readonly string[];
}

/**
 * The paths the edge answers itself, in `edge-router.js` order. Listed here so
 * an empty edge table is detectable; every one of them is asserted to classify
 * `edge-terminal` in `edge-owner.test.ts`, so this list cannot quietly drift
 * into fiction.
 */
export const EDGE_TERMINAL_PATHS = [
  "/health/system",
  "/health/uptime",
  "/health/performance",
  "/health/lighthouse",
  "/health/deps",
] as const;

/**
 * Minimal `HTMLRewriter`. The Workers runtime provides it; Node does not, and
 * `response-formatter.js`'s `addHeaders` calls it for any `text/html`
 * response. A pass-through is enough here: this adapter reads headers, never
 * bodies, so the nonce-injecting mock in
 * `infrastructure/worker/edge-router.test.js` would only add moving parts.
 */
class PassThroughHTMLRewriter {
  on(): this {
    return this;
  }
  transform(response: Response): Response {
    return response;
  }
}

function taggedResponse(tag: string, body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": contentType, [PROBE_HEADER]: tag },
  });
}

/**
 * Builds the stub `env` and swaps `globalThis.fetch` for the duration of one
 * probe. The swap is per-probe and always restored, so a thrown router error
 * cannot leave the process without a real `fetch`.
 */
export function createEdgeOwner(): EdgeOwner {
  async function probe(method: HttpMethod, path: string): Promise<EdgeProbe> {
    let originFetchCalls = 0;
    let staticBindingCalls = 0;

    // The three KV operations the Worker reaches on these paths: `get` (CSP
    // policy, circuit-breaker state, CI/deploy/migrate records), `put`
    // (rate-limit counters, circuit-breaker state) and `list`
    // (`health/lighthouse.js:11`). Empty answers throughout — every reader
    // already handles a miss, and with `get` always null the rate limiter's
    // count is always 0, so repeated probes of `/health/system` (10 req/60 s,
    // `rate-limiter.js:16`) can never shed.
    const kv = {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ keys: [], list_complete: true }),
    };

    const env: Record<string, unknown> = {
      API_ORIGIN: "https://api.mattbutlerengineering.com",
      HEALTH_STATE: kv,
    };
    for (const binding of STATIC_BINDINGS) {
      env[binding] = {
        fetch: async () => {
          staticBindingCalls += 1;
          // text/plain, not text/html: it keeps `addHeaders` off the
          // HTMLRewriter path for the common case without changing routing.
          return taggedResponse("static", "spa", "text/plain");
        },
      };
    }

    const realFetch = globalThis.fetch;
    const realRewriter = (globalThis as Record<string, unknown>).HTMLRewriter;
    globalThis.fetch = (async () => {
      originFetchCalls += 1;
      // Valid JSON: health/system.js's checkService() calls response.json() on
      // it. A throw there is swallowed as "timeout", which would still classify
      // correctly but would make the diagnostic counts harder to trust.
      return taggedResponse("origin", "{}", "application/json");
    }) as typeof globalThis.fetch;
    (globalThis as Record<string, unknown>).HTMLRewriter = PassThroughHTMLRewriter;

    try {
      const response = await edgeRouter.fetch(new Request(`${APEX}${path}`, { method }), env);
      const tag = response.headers.get(PROBE_HEADER);
      const disposition: EdgeDisposition =
        tag === "origin"
          ? "forwarded-to-origin"
          : tag === "static"
            ? "static-spa"
            : "edge-terminal";
      return { disposition, originFetchCalls, staticBindingCalls };
    } finally {
      globalThis.fetch = realFetch;
      (globalThis as Record<string, unknown>).HTMLRewriter = realRewriter;
    }
  }

  return {
    classify: probe,
    answers: async (method, path) => (await probe(method, path)).disposition === "edge-terminal",
    terminalPaths: EDGE_TERMINAL_PATHS,
  };
}

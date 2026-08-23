/**
 * Edge-CSP fixture — runs a Playwright BrowserContext behind the *real*
 * production Content-Security-Policy.
 *
 * Production serves this app through `infrastructure/worker`, which attaches
 * a strict nonce-based CSP to every HTML response and nonces every <script>
 * on the way out. No local vite server does either, so the E2E suite has
 * historically been unable to observe a CSP refusal at all — the hole this
 * fixture closes (docs/fixes/e2e-behind-edge-csp/).
 *
 * This module is a humble adapter. It holds no policy of its own: the
 * directive string and the nonce transform both come from
 * `@mbe/edge-worker/csp.js`, the same module `response-formatter.js` uses in
 * production, so the harness cannot drift from the edge.
 *
 * Known fidelity gap, recorded rather than hidden: production injects nonces
 * with HTMLRewriter + NonceInjector (a workerd API); `injectNonceIntoHtml` is
 * that injector's plain-string mirror. On real <script> elements the mirror is
 * a subset-or-equal of the parser, so the harness errs strict — a false red,
 * never a false green. See docs/fixes/e2e-behind-edge-csp/architecture.md.
 */

import type { BrowserContext, Page } from "@playwright/test";
import { buildCspDirectives, injectNonceIntoHtml } from "@mbe/edge-worker/csp.js";

/** One `securitypolicyviolation` event, as recorded by the page. */
export type CspViolation = {
  effectiveDirective: string;
  blockedURI: string;
  sample: string;
  documentURI: string;
};

export type ApplyEdgeCspOptions = {
  /**
   * Transform applied to the served HTML *before* nonce injection. Exists for
   * the negative self-test only: it reintroduces a known CSP-violating defect
   * so the guard can be observed going red. Production has no equivalent.
   */
  mutate?: (html: string) => string;
};

export type CspRecorder = {
  /** Returns every violation the page has recorded so far, and clears them. */
  drain(page: Page): Promise<CspViolation[]>;
};

/** Where the in-page listener accumulates violations before `drain` reads them. */
const STORE_KEY = "__edgeCspViolations__";

type ViolationStore = { [STORE_KEY]?: CspViolation[] };

/**
 * Route every document response in `context` through the production CSP, and
 * install the violation listener that `drain` reads.
 *
 * Fail-closed by construction: nothing here catches. Measured 2026-08-21 with a
 * deliberately throwing `mutate` — `page.goto` rejected with
 * `net::ERR_ABORTED` and Playwright additionally re-reported the throw as a
 * test error. The harness therefore cannot silently degrade into serving a
 * document with no policy. That outcome is not expressible as a self-asserting
 * test (a test cannot assert that it itself fails); the durable guard against
 * the pass-through outcome is assertion A1 in csp.spec.ts, which requires the
 * header on every covered route.
 */
export async function applyEdgeCsp(
  context: BrowserContext,
  options: ApplyEdgeCspOptions = {}
): Promise<CspRecorder> {
  // Installed via addInitScript so the listener exists before any page script
  // runs. A listener attached after navigation misses parse-time violations —
  // which is most of them.
  await context.addInitScript((key: string) => {
    const store: unknown[] = [];
    (window as unknown as Record<string, unknown>)[key] = store;
    document.addEventListener("securitypolicyviolation", (event) => {
      store.push({
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sample: event.sample,
        documentURI: event.documentURI,
      });
    });
  }, STORE_KEY);

  await context.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const original = await response.text();
    const body = injectNonceIntoHtml(options.mutate ? options.mutate(original) : original, nonce);

    const headers: Record<string, string> = { ...response.headers() };
    // The upstream length and encoding describe the body we just replaced.
    delete headers["content-length"];
    delete headers["content-encoding"];
    headers["content-security-policy"] = buildCspDirectives(nonce);

    await route.fulfill({ status: response.status(), headers, body });
  });

  return {
    async drain(page: Page): Promise<CspViolation[]> {
      return page.evaluate((key: string) => {
        const store = (window as unknown as ViolationStore)[key as typeof STORE_KEY];
        if (!Array.isArray(store)) {
          throw new Error(
            `applyEdgeCsp: no violation store on ${document.documentURI}. The init ` +
              "script did not run, so a zero-violation result would be meaningless."
          );
        }
        return store.splice(0, store.length);
      }, STORE_KEY);
    },
  };
}

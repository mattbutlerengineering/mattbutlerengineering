# Persistent nav host: the `eval` CSP violation (WO-02)

## Verdict

**Pre-existing standalone, and already fixed on `main` by #9039.** The violation is not caused by the nav host. It fires when hospitality is served on its own under the production policy, and it is silent. `'unsafe-eval'` stays banned and is not added.

## Origin

- **Package:** `zod` 4.6.7, bundled into the `json-render-vendor-*.js` chunk. `vite.manualChunks.ts` routes `@json-render/*` into that chunk, and Zod, which `@json-render/core` and `@json-render/react` depend on, ships inside it.
- **Call site:** Zod's `allowsEval` probe, in the minified chunk:

  ```js
  re = s(() => {
    if (M.jitless || (typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare")))
      return !1;
    try {
      return (Function(""), !0);
    } catch {
      return !1;
    }
  });
  ```

  The probe runs the first time an object schema is built. `@mbe/types` builds object schemas while the entry chunk evaluates, so it runs on every visit.

## Measurement

A scratch Node server served the built `apps/hospitality/dist` standalone at `/hospitality/`. Its headers came from the unmodified `buildCspDirectives(nonce)` and `injectNonceIntoHtml` in `infrastructure/worker/csp.js`. A Chromium page recorded `securitypolicyviolation` events after `networkidle` plus 1.5 s.

| Build                                          | CSP violations                                                                                               | Page                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `main` with the jitless line removed from HTML | 1: `script-src`, blocked `eval`, source `json-render-vendor-*.js`, line 1 col 2267 (the `Function("")` call) | renders, no console error                 |
| `main` as shipped (#9039)                      | 0                                                                                                            | renders, identical text, no console error |

## User-visible effect

None. Zod catches the thrown `EvalError` and falls back to its non-JIT parser, so no feature breaks. The cost was a CSP report on every page load (noise in the report endpoint and Sentry), which is what #9039 removed.

## Fix path

#9039 sets `globalThis.__zod_globalConfig = { jitless: true }` from a parser-blocking classic script in `apps/hospitality/index.html`, so Zod skips the probe. Pinned by `apps/hospitality/src/lib/zod-csp.test.ts`. No CSP was loosened. `infrastructure/worker/csp.test.js` now also asserts the policy never contains `unsafe-eval`.

## Consequences for the nav host

- Pre-existing, not host-only: it does not block Ship and routes to no further item.
- Any other app that bundles Zod 4 and builds an object schema at load would raise the same report under the same CSP. The shell must not import Zod object schemas on its own boot path, or must set jitless first the same way.
- For WO-17: with #9039 on `main` the expected count of CSP violations is 0, so no pre-existing violation needs naming.

## Not done

The Accept line asking for a Playwright spec that loads hospitality standalone under `csp.js` was not added here. That needs a built `dist` plus a server running the real policy, which `apps/hospitality`'s Playwright config (dev server and Auth0 setup project) does not have. WO-01 check 8 (zero CSP violations under the real policy) is the right home.

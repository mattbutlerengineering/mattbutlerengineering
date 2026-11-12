# Dynamic Invite og:image at the Edge (Satori + resvg-wasm) — November 2026

Evaluation for #8668 (The Invitation 8/9): render `/i/:token/card.png` in the edge worker, cached per invite, instead of the static per-venue PNG shipped in #8709. **Verdict: do not implement on the current plan.** Bundle size fits; CPU time does not.

## Current State

| Item        | Value                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker      | `infrastructure/worker` (`mattbutlerengineering-edge-router`), plain JS, no build step, `wrangler deploy`                                                 |
| Plan        | Workers **Free** (`docs/runbooks/edge-usage.md`: "a Workers Free account is itself capped at 100k requests/day")                                          |
| Today's og: | `invite-og.js` rewrites the head and points `og:image` at a static `/og/venues/<slug>.png`, falling back to `/og-hospitality.png`; fail-open on any error |
| Baseline    | `wrangler deploy --dry-run --outdir`: **54.31 KiB / gzip 12.76 KiB**                                                                                      |

## Limits (developers.cloudflare.com/workers/platform/limits, updated 2026-10-29, read 2026-11-11)

| Limit                      | Workers Free | Workers Paid |
| -------------------------- | ------------ | ------------ |
| Worker size (uncompressed) | 64 MiB       | 64 MiB       |
| Worker startup time        | 1 s          | 1 s          |
| CPU time per HTTP request  | **10 ms**    | 30 s default |

The page states there is no compressed-size limit; only the uncompressed bundle counts.

## Measurements

Real `wrangler deploy --dry-run --outdir` of the worker plus a render module (`satori@0.63.2/standalone` + `@resvg/resvg-wasm@2.6.2` + `layout.wasm` + one Inter woff, 30 KB):

| Bundle                          | Uncompressed | Gzip        |
| ------------------------------- | ------------ | ----------- |
| Baseline                        | 54.31 KiB    | 12.76 KiB   |
| With Satori + resvg-wasm + font | 4520.92 KiB  | 1635.18 KiB |

Components: `resvg index_bg.wasm` 2.37 MiB (0.91 MiB gzip), `layout.wasm` 509 KiB, JS 1.53 MiB (including inlined deps), font 30 KB. A real brand font would add a few hundred KB. That is about 7% of the 64 MiB limit, so size has ample headroom.

Render cost, measured in Node 1200x630 card with two text lines (a proxy for V8 isolate CPU; the Workers runtime is not reproducible locally, and the numbers are indicative only):

| Phase                         | Time          |
| ----------------------------- | ------------- |
| wasm compile (resvg + layout) | ~6 ms         |
| wasm init (resvg + yoga)      | ~11 ms        |
| first render: Satori / resvg  | ~42 / ~42 ms  |
| warm render: Satori / resvg   | ~2-4 / ~16 ms |
| whole cold process CPU        | ~310 ms       |

## Findings

1. **Size: fits.** +4.4 MiB uncompressed against a 64 MiB ceiling, and no compressed cap.
2. **CPU: does not fit on Workers Free.** The 10 ms per-request CPU limit is below even the warm resvg rasterisation (~16 ms) and far below a cold render (~100 ms). Every uncached invite would hit Error 1102. The fallback would still serve the static PNG, but only after the isolate is killed, so a fallback inside the worker cannot reliably catch it (an `exceededCpu` termination is not a catchable exception). A timeout guard does not help either, because the limit is CPU, not wall time.
3. **Startup: marginal.** Compiling and instantiating ~3 MiB of wasm at module scope plus a 4.4 MiB bundle costs well under the 1 s startup limit, but adds to every cold start of the whole edge router, including `/health` and the marketing site. Lazy init avoids that but then charges the CPU to the render request.
4. **Cache does not rescue it.** Per-invite caching means each new invite pays one cold-ish render, and crawlers fetching the card are the first requesters.
5. **Value is small.** The static per-venue card already carries venue branding. The dynamic card would add date/time/party size to the image, and those are already in `og:title` / `og:description`.

## Recommendation

Do not build the dynamic renderer now. Revisit only if one of these changes:

- The account moves to Workers Paid (raises CPU to 30 s default), and a product owner wants date/time baked into the image. Then render in the worker behind `ctx.waitUntil` plus the Cache API with the static PNG as the response on any error, with lazy wasm init so the rest of the router is unaffected.
- Alternatively render at invite creation in the reservations service (Node, no CPU cap), store the PNG as a static asset or object-storage object, and keep the worker as a pure head rewrite. This needs no worker bundle growth and is the preferred route if the feature is wanted on Free.

Privacy rules from the plan stay unchanged for any future design: payload carries no booker PII, the token never grants manage/cancel rights, and the token is never logged.

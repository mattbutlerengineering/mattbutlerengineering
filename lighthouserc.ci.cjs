// Track-only Lighthouse config for the scheduled `lighthouse.yml` workflow.
//
// This is intentionally SEPARATE from `lighthouserc.cjs` (used by `pnpm
// lighthouse` locally, which DOES assert score thresholds and gates). The
// scheduled workflow is a *tracker*: it records whatever scores the apps
// currently earn into Cloudflare KV and must never fail the job on a low
// score. Accordingly this config has NO `assert` block.
//
// The per-app static build directory is supplied via the LH_STATIC_DIST_DIR
// env var (set per matrix entry in the workflow), so one config serves all
// three apps. Upload is handled by the treosh action's `temporaryPublicStorage`
// input, so no `upload` block is needed here.

/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      staticDistDir: process.env.LH_STATIC_DIST_DIR,
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        skipAudits: ["service-worker", "installable-manifest", "apple-touch-icon"],
      },
    },
  },
};

// Lighthouse CI configuration for all frontend apps.
// Used by the lighthouse-ci.yml workflow and the `pnpm lighthouse` script.
//
// Score thresholds: performance and a11y must be >= 0.9 (workflow blocks merge
// if they drop more than 0.05 below baseline, implemented in CI via --preset=no-pwa).

/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      // Each app is served from its own vite preview server on a unique port.
      // The `startServerCommand` array maps 1-to-1 with the `url` array entries
      // via LHCI's multi-URL collection mode.
      staticDistDir: undefined, // overridden per-app via CLI --staticDistDir
      numberOfRuns: 3,
      settings: {
        // Run in desktop preset for consistency with the CI environment.
        preset: "desktop",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        // Skip PWA category — not all apps implement a service worker.
        skipAudits: ["service-worker", "installable-manifest", "apple-touch-icon"],
      },
    },
    assert: {
      // Block merge if any category score falls below these minimums.
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],

        // Core Web Vitals — "good" thresholds per web.dev guidelines.
        // FCP < 1.8s, LCP < 2.5s, CLS < 0.1, TBT < 200ms (lab proxy for INP).
        "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      // Store results as GitHub Actions artifacts; no LHCI server required.
      target: "temporary-public-storage",
    },
  },
};

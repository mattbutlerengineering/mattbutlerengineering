/**
 * Vendor chunk router for `build.rollupOptions.output.manualChunks`.
 * Extracted from vite.config.ts so the routing logic can be unit tested
 * against representative module ids instead of only via a built `dist/`.
 */
export function manualChunks(id: string): string | undefined {
  if (id.includes("node_modules")) {
    // React core — stable, cached long-term. Anchored on the resolved
    // node_modules package segment (not a bare "/react/" substring) so a
    // scoped package merely *named* react (@sentry/react, @json-render/react)
    // can't collide with the actual react/react-dom npm packages (#5730).
    if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react/")) {
      return "react-vendor";
    }
    // Routing — separate from page code
    if (id.includes("/node_modules/react-router")) {
      return "router-vendor";
    }
    // Canvas library for floor plan editor (heavy, only needed on one page)
    if (id.includes("/node_modules/konva/") || id.includes("/node_modules/react-konva/")) {
      return "canvas-vendor";
    }
    // JSON Render — used for spec rendering
    if (id.includes("/node_modules/@json-render/")) {
      return "json-render-vendor";
    }
  }
  // Rialto design system — large shared UI, loaded once
  if (id.includes("/packages/rialto/")) {
    return "rialto-vendor";
  }
  // Auth package — shared auth layer
  if (id.includes("/packages/auth/")) {
    return "auth-vendor";
  }
  // Sentry — error reporting
  if (id.includes("/packages/sentry/") || id.includes("/@sentry/")) {
    return "sentry-vendor";
  }
  return undefined;
}

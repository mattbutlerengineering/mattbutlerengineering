/**
 * Per-route head metadata. Pure data, no DOM: both the `useRouteMeta` hook and
 * the build-time route-html plugin (`pwa/route-html.ts`, which runs under the
 * Node tsconfig) import it.
 */

export interface RouteMeta {
  readonly pattern: string;
  readonly title: string;
  readonly description: string;
  /** False for the soft-404 catch-all: no canonical, robots noindex. */
  readonly indexable?: boolean;
}

const SITE_NAME = "Matt Butler Engineering";
export const SITE_ORIGIN = "https://mattbutlerengineering.com";

// First match wins; "*" (404) must stay last. "/" is intentionally absent:
// the homepage keeps the static title, description, canonical and social
// tags from index.html (canonical has a trailing slash; og:url does not).
export const ROUTE_META: readonly RouteMeta[] = [
  {
    pattern: "/status",
    title: `System Status — ${SITE_NAME}`,
    description:
      "Live health of the API services and static sites behind mattbutlerengineering.com.",
  },
  {
    pattern: "/metrics",
    title: `Quality Metrics — ${SITE_NAME}`,
    description:
      "Public AI Codebase Maturity Model metrics: current level, behavioral gates, agent performance and history.",
  },
  {
    pattern: "/acmm",
    title: `ACMM Dashboard — ${SITE_NAME}`,
    description:
      "Repo-level audit against the AI Codebase Maturity Model, with detected criteria by level.",
  },
  {
    pattern: "/ai-health",
    title: `AI Health Dashboard — ${SITE_NAME}`,
    description:
      "Live metrics for the AI agent system: sensors, CI, pull requests, queue efficiency and review burden.",
  },
  {
    pattern: "/shipped",
    title: `Shipped by the Factory — ${SITE_NAME}`,
    description:
      "Features the AI software factory proposed, decomposed and shipped, with their pull requests.",
  },
  {
    pattern: "/shipped/:slug",
    title: `Shipped Story — ${SITE_NAME}`,
    description:
      "How one feature went from proposal to decomposition to merged pull requests in the software factory.",
  },
  {
    pattern: "*",
    title: `Page not found — ${SITE_NAME}`,
    description: "This page does not exist on mattbutlerengineering.com.",
    // The SPA answers unknown paths with this shell and HTTP 200. A canonical
    // pointing at the homepage would tell search engines every missing URL is
    // a duplicate of home.
    indexable: false,
  },
];

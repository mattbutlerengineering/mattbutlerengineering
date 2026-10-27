import { useEffect } from "react";
import { matchPath, useLocation } from "react-router";

export interface RouteMeta {
  readonly pattern: string;
  readonly title: string;
  readonly description: string;
}

const SITE_NAME = "Matt Butler Engineering";

// First match wins; "*" (404) must stay last. "/" is intentionally absent:
// the homepage keeps the static title and description from index.html.
export const ROUTE_META: readonly RouteMeta[] = [
  {
    pattern: "/status",
    title: `System Status — ${SITE_NAME}`,
    description:
      "Live health of the API services and static sites behind mattbutlerengineering.com.",
  },
  {
    pattern: "/weekly",
    title: `Weekly Information Intake — ${SITE_NAME}`,
    description: "The articles, talks and resources Matt Butler reads and learns from each week.",
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
  },
];

export function findRouteMeta(pathname: string): RouteMeta | undefined {
  if (pathname === "/") return undefined;
  return ROUTE_META.find((meta) => matchPath({ path: meta.pattern, end: true }, pathname));
}

function setDescription(content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  tag.content = content;
}

export function useRouteMeta(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = findRouteMeta(pathname);
    if (!meta) return;
    document.title = meta.title;
    setDescription(meta.description);
  }, [pathname]);
}

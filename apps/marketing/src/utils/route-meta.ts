import { useEffect, useState } from "react";
import { matchPath, useLocation } from "react-router";

export interface RouteMeta {
  readonly pattern: string;
  readonly title: string;
  readonly description: string;
  /** False for the soft-404 catch-all: no canonical, robots noindex. */
  readonly indexable?: boolean;
}

const SITE_NAME = "Matt Butler Engineering";
const SITE_ORIGIN = "https://mattbutlerengineering.com";
const NOT_FOUND_ROBOTS = "noindex";

// First match wins; "*" (404) must stay last. "/" is intentionally absent:
// the homepage keeps the static title, description, canonical and social
// tags from index.html (canonical has a trailing slash; og:url does not).
const ROUTE_META: readonly RouteMeta[] = [
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
    // The SPA answers unknown paths with this shell and HTTP 200. A canonical
    // pointing at the homepage would tell search engines every missing URL is
    // a duplicate of home.
    indexable: false,
  },
];

interface HeadSnapshot {
  readonly title: string;
  readonly description: string;
  readonly canonical: string | null;
  readonly ogTitle: string;
  readonly ogDescription: string;
  readonly ogUrl: string | null;
  readonly twitterTitle: string;
  readonly twitterDescription: string;
  readonly robots: string;
}

function findRouteMeta(pathname: string): RouteMeta | undefined {
  if (pathname === "/") return undefined;
  return ROUTE_META.find((meta) => matchPath({ path: meta.pattern, end: true }, pathname));
}

function readMeta(selector: string): string {
  return document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? "";
}

function readHeadDefaults(): HeadSnapshot {
  const canonical =
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute("href") ??
    "";
  const ogUrl = readMeta('meta[property="og:url"]');
  return {
    title: document.title,
    description: readMeta('meta[name="description"]'),
    canonical: canonical || null,
    ogTitle: readMeta('meta[property="og:title"]'),
    ogDescription: readMeta('meta[property="og:description"]'),
    ogUrl: ogUrl || null,
    twitterTitle: readMeta('meta[name="twitter:title"]'),
    twitterDescription: readMeta('meta[name="twitter:description"]'),
    robots: readMeta('meta[name="robots"]') || "index, follow",
  };
}

function upsertMeta(attribute: "name" | "property", key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function removeMeta(attribute: "name" | "property", key: string): void {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

function setCanonical(href: string | null): void {
  const tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) {
    tag?.remove();
    return;
  }
  const link = tag ?? document.createElement("link");
  if (tag === null) {
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function setOgUrl(content: string | null): void {
  if (content === null) {
    removeMeta("property", "og:url");
    return;
  }
  upsertMeta("property", "og:url", content);
}

function absoluteUrl(pathname: string): string {
  return new URL(pathname, `${SITE_ORIGIN}/`).href;
}

function applyHead(head: HeadSnapshot): void {
  document.title = head.title;
  upsertMeta("name", "description", head.description);
  setCanonical(head.canonical);
  upsertMeta("property", "og:title", head.ogTitle);
  upsertMeta("property", "og:description", head.ogDescription);
  setOgUrl(head.ogUrl);
  upsertMeta("name", "twitter:title", head.twitterTitle);
  upsertMeta("name", "twitter:description", head.twitterDescription);
  upsertMeta("name", "robots", head.robots);
}

function headForPath(pathname: string, defaults: HeadSnapshot): HeadSnapshot {
  const meta = findRouteMeta(pathname);
  if (!meta) return defaults;
  if (meta.indexable === false) {
    return {
      title: meta.title,
      description: meta.description,
      canonical: null,
      ogTitle: meta.title,
      ogDescription: meta.description,
      ogUrl: null,
      twitterTitle: meta.title,
      twitterDescription: meta.description,
      robots: NOT_FOUND_ROBOTS,
    };
  }
  const url = absoluteUrl(pathname);
  return {
    title: meta.title,
    description: meta.description,
    canonical: url,
    ogTitle: meta.title,
    ogDescription: meta.description,
    ogUrl: url,
    twitterTitle: meta.title,
    twitterDescription: meta.description,
    robots: defaults.robots,
  };
}

/**
 * Rewrites document title, description, canonical and social tags for the
 * current path. Marketing is one Vite SPA: the edge router serves index.html
 * for every marketing path, so those tags are homepage values until this
 * runs. Per-route prerender would need a second HTML file per path and a
 * worker change to serve it; crawlers that execute JS (and in-browser
 * previews) see the updated tags from here.
 */
export function useRouteMeta(): void {
  const { pathname } = useLocation();
  // Captured during the first render, before child effects (NotFoundPage
  // writes document.title) and before this hook overwrites the shell.
  const [defaults] = useState(readHeadDefaults);
  useEffect(() => {
    applyHead(headForPath(pathname, defaults));
  }, [pathname, defaults]);
}

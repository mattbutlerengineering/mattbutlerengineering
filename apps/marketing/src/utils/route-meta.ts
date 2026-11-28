import { useEffect, useState } from "react";
import { matchPath, useLocation } from "react-router";
import { ROUTE_META, SITE_ORIGIN, type RouteMeta } from "./route-meta-data.js";

const NOT_FOUND_ROBOTS = "noindex";

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

type TextOverride = Pick<RouteMeta, "title" | "description">;

// Per-path title/description a page supplies once its data has loaded. Keeping
// the data lookup in the page keeps its (large) data module out of the entry
// chunk, which runs this hook for every route.
const pathOverrides = new Map<string, TextOverride>();

function applyText({ title, description }: TextOverride): void {
  document.title = title;
  upsertMeta("name", "description", description);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
}

/**
 * Lets a page replace its route's title and description (e.g. a story page
 * using its feature title). Child effects run before `useRouteMeta`'s, so the
 * override is registered by path and `headForPath` honours it. Pass
 * `undefined` to keep the route's static metadata.
 */
export function useRouteMetaOverride(override: TextOverride | undefined): void {
  const { pathname } = useLocation();
  const title = override?.title;
  const description = override?.description;
  useEffect(() => {
    if (title === undefined || description === undefined) return undefined;
    pathOverrides.set(pathname, { title, description });
    applyText({ title, description });
    return () => {
      pathOverrides.delete(pathname);
    };
  }, [pathname, title, description]);
}

function headForPath(pathname: string, defaults: HeadSnapshot): HeadSnapshot {
  const base = findRouteMeta(pathname);
  if (!base) return defaults;
  const meta = { ...base, ...pathOverrides.get(pathname) };
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

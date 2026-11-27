import { useEffect } from "react";
import { useLocation } from "react-router";
import { PAGE_REGISTRY } from "./data/page-registry.js";
import { resolveHead, type Head } from "./data/route-head-data.js";

function setMeta(attribute: "name" | "property", key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

function applyHead(head: Head): void {
  document.title = head.title;
  setCanonical(head.url);
  setMeta("property", "og:url", head.url);
  setMeta("property", "og:title", head.socialTitle);
  setMeta("name", "twitter:title", head.socialTitle);
}

/**
 * Points canonical, og:url, og:title and twitter:title at the current route.
 * The shell (`index.html`) is the design-system home; without this, every
 * client navigation keeps advertising `/rialto/`.
 */
export function useRouteHead(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    applyHead(resolveHead(pathname, PAGE_REGISTRY));
  }, [pathname]);
}

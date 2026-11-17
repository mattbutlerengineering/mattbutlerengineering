import type { Plugin } from "vite";
import { SITE_ORIGIN, type RouteMeta } from "../src/utils/route-meta-data.js";

/**
 * Crawlers and link-preview bots read the served HTML, not the head that
 * `useRouteMeta` writes after render. This emits one copy of the built shell
 * per static route (`metrics.html` for `/metrics`) with that route's title,
 * description, canonical and social tags already in place. Workers Static
 * Assets serves `/metrics` from `metrics.html`; every other path still falls
 * back to `index.html`, and the SPA takes over exactly as before.
 */

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = html.match(new RegExp(pattern.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `route-html: expected exactly one ${label} tag in the built index.html, found ${matches.length}`
    );
  }
  return html.replace(pattern, () => replacement);
}

function metaTag(attribute: "name" | "property", key: string): RegExp {
  return new RegExp(`<meta\\s+${attribute}="${escapeRegExp(key)}"\\s+content="[^"]*"\\s*/>`);
}

/** Static, indexable routes: no params, no catch-all, not the homepage. */
export function prerenderableRoutes(routes: readonly RouteMeta[]): readonly RouteMeta[] {
  return routes.filter(
    (route) =>
      route.pattern !== "/" &&
      route.pattern !== "*" &&
      !route.pattern.includes(":") &&
      route.indexable !== false
  );
}

/** The built shell with one route's head tags substituted. Throws if a tag is missing. */
export function renderRouteHtml(shell: string, meta: RouteMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = `${SITE_ORIGIN}${meta.pattern}`;

  let html = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>${title}</title>`, "title");
  html = replaceOnce(
    html,
    metaTag("name", "description"),
    `<meta name="description" content="${description}" />`,
    "description"
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`,
    "canonical"
  );
  const social: ReadonlyArray<readonly ["name" | "property", string, string]> = [
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
  ];
  for (const [attribute, key, content] of social) {
    html = replaceOnce(
      html,
      metaTag(attribute, key),
      `<meta ${attribute}="${key}" content="${content}" />`,
      key
    );
  }
  return html;
}

/** Vite build plugin: emits `<route>.html` beside `index.html` for each route. */
export function routeHtmlPlugin(routes: readonly RouteMeta[]): Plugin {
  const targets = prerenderableRoutes(routes);
  return {
    name: "mbe:route-html",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const shell = bundle["index.html"];
        if (shell === undefined || shell.type !== "asset") {
          throw new Error("route-html: index.html was not emitted before route pages");
        }
        const source = String(shell.source);
        for (const meta of targets) {
          this.emitFile({
            type: "asset",
            fileName: `${meta.pattern.slice(1)}.html`,
            source: renderRouteHtml(source, meta),
          });
        }
      },
    },
  };
}

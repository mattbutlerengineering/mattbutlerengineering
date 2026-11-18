import type { Plugin } from "vite";

/**
 * Crawlers and link-preview bots read the served HTML, not the title the
 * client sets after render. `/rialto/demos/` otherwise answers with the
 * design-system home's `index.html` and the same title. This emits
 * `demos/index.html` (the edge router strips `/rialto`, so Workers Static
 * Assets serves it for `/demos/`) with the demos index's own head tags.
 */

export const DEMOS_TITLE = "Demos — Rialto Design System";
const DEMOS_URL = "https://mattbutlerengineering.com/rialto/demos/";

function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = html.match(new RegExp(pattern.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `route-html: expected exactly one ${label} tag in the built index.html, found ${matches.length}`
    );
  }
  return html.replace(pattern, () => replacement);
}

/** The built shell with the demos index's title, social titles and URLs substituted. */
export function renderDemosHtml(shell: string): string {
  let html = replaceOnce(shell, /<title>[^<]*<\/title>/, `<title>${DEMOS_TITLE}</title>`, "title");
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${DEMOS_TITLE}" />`,
    "og:title"
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${DEMOS_TITLE}" />`,
    "twitter:title"
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${DEMOS_URL}" />`,
    "canonical"
  );
  return replaceOnce(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${DEMOS_URL}" />`,
    "og:url"
  );
}

/** Vite build plugin: emits `demos/index.html` beside `index.html`. */
export function demosRouteHtmlPlugin(): Plugin {
  return {
    name: "mbe:rialto-demos-route-html",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const shell = bundle["index.html"];
        if (shell === undefined || shell.type !== "asset") {
          throw new Error("route-html: index.html was not emitted before the demos page");
        }
        this.emitFile({
          type: "asset",
          fileName: "demos/index.html",
          source: renderDemosHtml(String(shell.source)),
        });
      },
    },
  };
}

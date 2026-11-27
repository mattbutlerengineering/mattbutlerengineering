/**
 * Per-route document title, canonical URL and social title.
 *
 * Pure data: the client hook and the build-time HTML emitter both call this.
 * Home keeps the two strings `index.html` ships (`<title>` is not `og:title`).
 * `/demos` keeps a trailing slash, matching `demos/index.html` and the sitemap.
 * Every other route is the sitemap form: no trailing slash.
 */

const SITE_ORIGIN = "https://mattbutlerengineering.com";

/** `<title>` on `/rialto/`. */
export const HOME_TITLE = "Rialto — Design System";

/** `og:title` and `twitter:title` on `/rialto/`. Not the same string as HOME_TITLE. */
export const HOME_SOCIAL_TITLE = "Rialto Design System";

export const HOME_CANONICAL = `${SITE_ORIGIN}/rialto/`;

/** `<title>`, `og:title` and `twitter:title` of the static `demos/index.html`. */
export const DEMOS_TITLE = "Demos — Rialto Design System";

/** Appended to a page heading to form `document.title`. */
export const TITLE_SUFFIX = " — Rialto";

export interface Head {
  readonly title: string;
  readonly url: string;
  readonly socialTitle: string;
}

export interface CatalogEntry {
  readonly path: string;
  readonly label: string;
  readonly heading?: string;
}

export interface PrerenderHead {
  readonly title: string;
  readonly url: string;
  readonly fileName: string;
  /** Set to keep the page out of search results; absent leaves the shell's `index, follow`. */
  readonly robots?: "noindex";
}

const HOME_HEAD: Head = {
  title: HOME_TITLE,
  url: HOME_CANONICAL,
  socialTitle: HOME_SOCIAL_TITLE,
};

function documentTitle(stem: string): string {
  return `${stem}${TITLE_SUFFIX}`;
}

/** App pathname with a leading slash and no trailing slash (`/` stays `/`). */
function normalizePath(pathname: string): string {
  const withLead = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLead === "/") return "/";
  return withLead.replace(/\/+$/, "");
}

export function canonicalUrl(pathname: string): string {
  const path = normalizePath(pathname);
  if (path === "/") return HOME_CANONICAL;
  if (path === "/demos") return `${SITE_ORIGIN}/rialto/demos/`;
  return `${SITE_ORIGIN}/rialto${path}`;
}

/**
 * Dist path Workers Static Assets serves for an extensionless request.
 * `components/accordion.html` answers `/components/accordion` (no redirect).
 * A directory `index.html` would 307 that URL onto a trailing slash, which
 * the sitemap does not use.
 */
export function routeHtmlFileName(pathname: string): string {
  const path = normalizePath(pathname);
  if (path === "/") {
    throw new Error("route-html: the home route is index.html, not a per-route file");
  }
  return `${path.slice(1)}.html`;
}

/**
 * Static routes that are not in PAGE_REGISTRY. Stems match the `DocumentTitle`
 * values in routes.tsx. `/demos` is absent: its raw HTML is `demos/index.html`.
 */
const EXTRA_ROUTES: readonly { readonly path: string; readonly stem: string }[] = [
  { path: "/demos/login", stem: "Sign In" },
  { path: "/demos/signup", stem: "Sign Up" },
  { path: "/demos/session-expired", stem: "Session Expired" },
  { path: "/demos/dashboard", stem: "Pit Wall" },
  { path: "/demos/teams/new", stem: "Team Create" },
  { path: "/demos/layouts", stem: "Layout Demo" },
  { path: "/demos/telemetry", stem: "Telemetry HUD" },
  { path: "/demos/auth-flow", stem: "Auth Flow" },
  { path: "/demos/drivers", stem: "Drivers CRUD" },
  { path: "/demos/drivers/new", stem: "New Driver" },
  { path: "/demos/visual-test", stem: "Visual Test" },
  { path: "/visual-test", stem: "Visual Test" },
  { path: "/privacy", stem: "Privacy Policy" },
];

/** Screenshot fixtures: reachable for tests, not for crawlers. */
const NOINDEX_PATHS: ReadonlySet<string> = new Set(["/visual-test", "/demos/visual-test"]);

/** More specific patterns first so `/edit` is not swallowed by the id route. */
const DYNAMIC_ROUTES: readonly { readonly pattern: RegExp; readonly stem: string }[] = [
  { pattern: /^\/demos\/drivers\/[^/]+\/edit$/, stem: "Edit Driver" },
  { pattern: /^\/demos\/drivers\/[^/]+$/, stem: "Driver" },
];

function headForStem(path: string, stem: string): Head {
  const title = documentTitle(stem);
  return { title, url: canonicalUrl(path), socialTitle: title };
}

const EXTRA_BY_PATH = new Map(
  EXTRA_ROUTES.map((route) => [route.path, headForStem(route.path, route.stem)])
);

export function resolveHead(pathname: string, entries: readonly CatalogEntry[]): Head {
  const path = normalizePath(pathname);
  if (path === "/") return HOME_HEAD;
  if (path === "/demos") {
    return { ...headForStem(path, "Demos"), socialTitle: DEMOS_TITLE };
  }

  const entry = entries.find((candidate) => candidate.path === path);
  if (entry) return headForStem(path, entry.heading ?? entry.label);

  const extra = EXTRA_BY_PATH.get(path);
  if (extra) return extra;

  for (const route of DYNAMIC_ROUTES) {
    if (route.pattern.test(path)) return headForStem(path, route.stem);
  }

  // The `*` route redirects to `/`. Advertise home rather than the previous page.
  return HOME_HEAD;
}

/** Static HTML files to emit besides `index.html` and `demos/index.html`. */
export function prerenderHeads(entries: readonly CatalogEntry[]): PrerenderHead[] {
  const catalog = entries.map((entry) => {
    const title = documentTitle(entry.heading ?? entry.label);
    return { title, url: canonicalUrl(entry.path), fileName: routeHtmlFileName(entry.path) };
  });
  const extras = EXTRA_ROUTES.map((route) => ({
    title: documentTitle(route.stem),
    url: canonicalUrl(route.path),
    fileName: routeHtmlFileName(route.path),
    ...(NOINDEX_PATHS.has(route.path) ? { robots: "noindex" as const } : {}),
  }));
  return [...catalog, ...extras];
}

/**
 * Host-dependent identity of the hospitality app (#7709).
 *
 * One build is served from two hosts: under `/hospitality` on
 * mattbutlerengineering.com (part of the larger site), and at the root of
 * eat-sheet.com, standalone and under the eat-sheet name. Everything that
 * differs between the two — router basename, product name, where "home" is —
 * is derived here from the hostname, never from a hard-coded domain at a call
 * site.
 */

export interface Brand {
  /** Product name shown in titles, the header, guest pages and copyright. */
  readonly name: string;
  /** Short wordmark rendered as the header logo. */
  readonly logo: string;
}

export interface HostConfig {
  readonly brand: Brand;
  /** React Router basename: "" when the app owns the host's root. */
  readonly basename: string;
  /** True when the host serves only this app (no marketing / rialto / gen pages). */
  readonly standalone: boolean;
}

const EAT_SHEET_HOSTS: ReadonlySet<string> = new Set(["eat-sheet.com", "www.eat-sheet.com"]);

const EAT_SHEET: HostConfig = {
  brand: { name: "eat-sheet", logo: "eat-sheet" },
  basename: "",
  standalone: true,
};

const MBE: HostConfig = {
  brand: { name: "Matt Butler Engineering", logo: "MBE" },
  basename: "/hospitality",
  standalone: false,
};

export function hostConfig(hostname: string): HostConfig {
  return EAT_SHEET_HOSTS.has(hostname.toLowerCase()) ? EAT_SHEET : MBE;
}

/** The config for the host this page is being served from. */
export function currentHostConfig(): HostConfig {
  return hostConfig(typeof window === "undefined" ? "" : window.location.hostname);
}

/** Absolute URL of an in-app path (e.g. "/reservations/manage") on the serving host. */
export function appUrl(
  path: string,
  location: Pick<Location, "origin" | "hostname"> = window.location
): string {
  return `${location.origin}${hostConfig(location.hostname).basename}${path}`;
}

/**
 * Where a guest's "Back to <brand>" link goes: the serving host's root — the
 * marketing home on mattbutlerengineering.com, the eat-sheet landing on
 * eat-sheet.com.
 */
export function homeUrl(location: Pick<Location, "origin"> = window.location): string {
  return `${location.origin}/`;
}

/** The guest self-service manage/cancel page (route "reservations/manage") for a token. */
export function manageReservationUrl(
  token: string,
  location: Pick<Location, "origin" | "hostname"> = window.location
): string {
  return `${appUrl("/reservations/manage", location)}?token=${encodeURIComponent(token)}`;
}

const LEGACY_BASE = "/hospitality";

/**
 * On a root-served host, the in-app path a legacy `/hospitality/...` URL maps
 * to (links in emails sent before the move, or built from the `/hospitality/`
 * asset base), or null when no rewrite is needed.
 */
export function legacyPathRedirect(pathname: string, basename: string): string | null {
  if (basename === LEGACY_BASE) return null;
  if (pathname !== LEGACY_BASE && !pathname.startsWith(`${LEGACY_BASE}/`)) return null;
  return pathname.slice(LEGACY_BASE.length) || "/";
}

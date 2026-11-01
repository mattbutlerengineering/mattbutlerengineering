/** Path of the guest manage page on the web origin (MANAGE_BASE_URL). */
export const MANAGE_PATH = "/hospitality/reservations/manage";

/**
 * Path of the guest manage page on eat-sheet.com, which serves hospitality
 * at its root rather than under a `/hospitality` basename (#7709, #7892) —
 * mirrors apps/hospitality/src/lib/host-brand.ts's basename split.
 */
export const EAT_SHEET_MANAGE_PATH = "/reservations/manage";

const EAT_SHEET_HOSTNAMES: ReadonlySet<string> = new Set(["eat-sheet.com", "www.eat-sheet.com"]);

/** The manage path for a given web origin — eat-sheet.com's root-served path, else the default. */
function managePathFor(origin: string): string {
  try {
    return EAT_SHEET_HOSTNAMES.has(new URL(origin).hostname.toLowerCase())
      ? EAT_SHEET_MANAGE_PATH
      : MANAGE_PATH;
  } catch {
    return MANAGE_PATH;
  }
}

/**
 * The only place a guest manage link is built. `baseUrl` is the web origin
 * (MANAGE_BASE_URL, or eat-sheet.com's own origin for a booking made there);
 * `rebook` is an optional slot id for one-tap rebooking.
 */
export function buildManageUrl(baseUrl: string, token: string, rebook?: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  const rebookParam = rebook === undefined ? "" : `&rebook=${encodeURIComponent(rebook)}`;
  return `${origin}${managePathFor(origin)}?token=${encodeURIComponent(token)}${rebookParam}`;
}

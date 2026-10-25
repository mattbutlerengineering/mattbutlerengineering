/** Path of the guest manage page on the web origin (MANAGE_BASE_URL). */
export const MANAGE_PATH = "/hospitality/reservations/manage";

/**
 * The only place a guest manage link is built. `baseUrl` is the web origin
 * (MANAGE_BASE_URL); `rebook` is an optional slot id for one-tap rebooking.
 */
export function buildManageUrl(baseUrl: string, token: string, rebook?: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  const rebookParam = rebook === undefined ? "" : `&rebook=${encodeURIComponent(rebook)}`;
  return `${origin}${MANAGE_PATH}?token=${encodeURIComponent(token)}${rebookParam}`;
}

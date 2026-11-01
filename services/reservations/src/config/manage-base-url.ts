/** Web origin used when MANAGE_BASE_URL is unset (local dev, tests). */
export const DEFAULT_MANAGE_BASE_URL = "https://mattbutlerengineering.com";

/**
 * The single configured public web origin that guest-facing links (manage /
 * cancel / modify, closure notices, SMS) are built from. Hospitality is served
 * from more than one host (#7709), so this is configuration, read in one place,
 * never a domain repeated at each call site. Trailing slashes are stripped.
 */
export function resolveManageBaseUrl(env: { MANAGE_BASE_URL?: string | undefined }): string {
  const raw = (env.MANAGE_BASE_URL ?? "").trim();
  return raw === "" ? DEFAULT_MANAGE_BASE_URL : raw.replace(/\/+$/, "");
}

/** Web origin used when EAT_SHEET_MANAGE_BASE_URL is unset (local dev, tests). */
export const DEFAULT_EAT_SHEET_MANAGE_BASE_URL = "https://eat-sheet.com";

/**
 * The configured public web origin for guest-facing links on eat-sheet.com
 * (#7892's brand-by-host), read the same way as `resolveManageBaseUrl`.
 */
export function resolveEatSheetManageBaseUrl(env: {
  EAT_SHEET_MANAGE_BASE_URL?: string | undefined;
}): string {
  const raw = (env.EAT_SHEET_MANAGE_BASE_URL ?? "").trim();
  return raw === "" ? DEFAULT_EAT_SHEET_MANAGE_BASE_URL : raw.replace(/\/+$/, "");
}

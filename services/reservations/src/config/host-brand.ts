/**
 * Guest-email branding by the host a booking came from (#7892, follow-up to
 * #7709/#7872's "emails sent from that host" criterion). Mirrors
 * apps/hospitality/src/lib/host-brand.ts's host-to-identity split, server side.
 */
import { resolveEatSheetManageBaseUrl, resolveManageBaseUrl } from "./manage-base-url.js";

export type OriginHost = "eat-sheet.com" | "mattbutlerengineering.com";

const EAT_SHEET_HOSTNAMES: ReadonlySet<string> = new Set(["eat-sheet.com", "www.eat-sheet.com"]);
const MBE_HOSTNAMES: ReadonlySet<string> = new Set([
  "mattbutlerengineering.com",
  "www.mattbutlerengineering.com",
]);

/**
 * Allowlists a request's `Origin` header against the two hosts hospitality
 * is served from. Anything else — a missing header, an unknown host, a
 * malformed value — resolves to `null`, which keeps today's
 * mattbutlerengineering.com behavior (see {@link hostBrandFor}). Never trust
 * the raw header value past this allowlist.
 */
export function resolveOriginHost(
  origin: string | readonly string[] | undefined | null
): OriginHost | null {
  const value = Array.isArray(origin) ? origin[0] : origin;
  if (!value) return null;

  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (EAT_SHEET_HOSTNAMES.has(hostname)) return "eat-sheet.com";
  if (MBE_HOSTNAMES.has(hostname)) return "mattbutlerengineering.com";
  return null;
}

export interface ReservationHostBrand {
  readonly brandName: string;
  readonly fromAddress: string;
  readonly manageBaseUrl: string;
}

export interface HostBrandEnv {
  /**
   * The verified Resend sending domain's address. Never varies by host:
   * eat-sheet.com is not (yet) a verified sending domain, so the envelope
   * from-address always stays here — only the display name changes (#7892).
   */
  readonly verifiedFromAddress: string;
  readonly mbeManageBaseUrl: string;
  readonly eatSheetManageBaseUrl: string;
}

const EAT_SHEET_BRAND_NAME = "eat-sheet";
const MBE_BRAND_NAME = "Matt Butler Engineering";

/** Wraps a bare or already-named ("Name <email>") from-address with a new display name. */
function withDisplayName(name: string, address: string): string {
  const email = address.match(/<([^>]+)>/)?.[1] ?? address;
  return `${name} <${email}>`;
}

/**
 * The brand (display name, from-address, manage-link base) for a
 * reservation's origin host. `originHost` is the value stored on the
 * reservation — anything but the literal `"eat-sheet.com"` (including
 * `null`) keeps today's mattbutlerengineering.com brand.
 */
export function hostBrandFor(originHost: string | null, env: HostBrandEnv): ReservationHostBrand {
  if (originHost === "eat-sheet.com") {
    return {
      brandName: EAT_SHEET_BRAND_NAME,
      fromAddress: withDisplayName(EAT_SHEET_BRAND_NAME, env.verifiedFromAddress),
      manageBaseUrl: env.eatSheetManageBaseUrl,
    };
  }
  return {
    brandName: MBE_BRAND_NAME,
    fromAddress: env.verifiedFromAddress,
    manageBaseUrl: env.mbeManageBaseUrl,
  };
}

/**
 * Reads the brand env vars once (`EMAIL_FROM`, `MANAGE_BASE_URL`,
 * `EAT_SHEET_MANAGE_BASE_URL`) and returns a resolver closed over them, so
 * `notifications.ts` and `app.ts` share one source of truth instead of each
 * re-reading `process.env`.
 */
export function createHostBrandResolver(env: {
  EMAIL_FROM?: string | undefined;
  MANAGE_BASE_URL?: string | undefined;
  EAT_SHEET_MANAGE_BASE_URL?: string | undefined;
}): (originHost: string | null) => ReservationHostBrand {
  const brandEnv: HostBrandEnv = {
    verifiedFromAddress: env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
    mbeManageBaseUrl: resolveManageBaseUrl(env),
    eatSheetManageBaseUrl: resolveEatSheetManageBaseUrl(env),
  };
  return (originHost) => hostBrandFor(originHost, brandEnv);
}

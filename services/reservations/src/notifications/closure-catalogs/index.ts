import type { GuestNoticeLocale } from "@mbe/types";
import { enUS } from "./en-US.js";
import { esMX } from "./es-MX.js";
import { frCA } from "./fr-CA.js";
import type { ClosureCatalog } from "./types.js";

export type { ClosureCatalog, DateParts, NoticeFacts } from "./types.js";

const CATALOGS: Readonly<Record<GuestNoticeLocale, ClosureCatalog>> = {
  "en-US": enUS,
  "es-MX": esMX,
  "fr-CA": frCA,
};

/** The closure notice copy for a guest's language. */
export function closureCatalog(locale: GuestNoticeLocale): ClosureCatalog {
  return CATALOGS[locale];
}

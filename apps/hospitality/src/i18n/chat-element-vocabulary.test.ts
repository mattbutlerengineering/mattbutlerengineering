import { describe, expect, it } from "vitest";
import { enUS, type RialtoMessages } from "@mattbutlerengineering/rialto/providers";
import { enGB } from "@mattbutlerengineering/rialto/locales/en-GB";
import { esMX } from "@mattbutlerengineering/rialto/locales/es-MX";
import { frCA } from "@mattbutlerengineering/rialto/locales/fr-CA";
import appEnUS from "./catalogs/en-US.json";
import appEnGB from "./catalogs/en-GB.json";
import appEsMX from "./catalogs/es-MX.json";
import appFrCA from "./catalogs/fr-CA.json";
import type { LocaleTag } from "./locales.js";

/**
 * The dashboard owns the reservation-status, guest-risk and Walk-in words; the
 * rialto chat elements carry a copy so they render without the app catalog.
 * This pins the copy to the owner, so the chat and the dashboard never disagree.
 */
type Catalog = Record<string, unknown>;

const LOCALES: readonly (readonly [LocaleTag, RialtoMessages, Catalog])[] = [
  ["en-US", enUS, appEnUS],
  ["en-GB", enGB, appEnGB],
  ["es-MX", esMX, appEsMX],
  ["fr-CA", frCA, appFrCA],
];

/** Resolves a dotted key the way the runtime does: the locale's catalog, then en-US (fallbackLng). */
function appWord(catalog: Catalog, key: string): unknown {
  const lookup = (c: Catalog) =>
    key.split(".").reduce<unknown>((node, part) => (node as Catalog | undefined)?.[part], c);
  return lookup(catalog) ?? lookup(appEnUS);
}

describe("chat element vocabulary matches the dashboard", () => {
  it.each(LOCALES)("%s reservation status words", (_tag, rialto, catalog) => {
    for (const [key, word] of Object.entries(rialto.reservationStatus)) {
      expect(word, `timeline.status.${key}`).toBe(appWord(catalog, `timeline.status.${key}`));
    }
  });

  it.each(LOCALES)("%s guest risk words", (_tag, rialto, catalog) => {
    for (const [key, word] of Object.entries(rialto.guestRisk)) {
      expect(word, `crm.risk.${key}`).toBe(appWord(catalog, `crm.risk.${key}`));
    }
  });

  it.each(LOCALES)("%s Walk-in", (_tag, rialto, catalog) => {
    expect(rialto.walkIn).toBe(appWord(catalog, "home.reservations.walkIn"));
  });
});

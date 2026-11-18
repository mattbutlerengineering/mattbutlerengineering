import { describe, it, expect } from "vitest";
import { CATALOGS, SIDENAV_LOCALES, resolveLocale, translate } from "./i18n.js";
import { sections } from "./sections.js";
import { SIDENAV_CONTRACT, type SideNavProps } from "./types.js";

const noop = (): void => undefined;
const base: SideNavProps = {
  contract: SIDENAV_CONTRACT,
  pathname: "/",
  locale: "en-US",
  direction: "ltr",
  flags: { isAdmin: true },
  readiness: { status: "operational", steps: [] },
  isMobileOpen: false,
  onAction: noop,
  onMobileClose: noop,
};

const labelsFor = (locale: string) =>
  sections({ ...base, locale }).flatMap((s) => [s.label, ...s.items.map((i) => i.label)]);

describe("side-nav label catalogs", () => {
  it("ships en-US, en-GB, es-MX and fr-CA", () => {
    expect([...SIDENAV_LOCALES]).toEqual(["en-US", "en-GB", "es-MX", "fr-CA"]);
  });

  it("every locale defines every key en-US defines", () => {
    const keys = Object.keys(CATALOGS["en-US"]).sort();
    for (const locale of SIDENAV_LOCALES) {
      expect(Object.keys(CATALOGS[locale]).sort(), locale).toEqual(keys);
    }
  });

  it("renders the sections in each locale", () => {
    expect(labelsFor("en-US")).toContain("Tonight's Service");
    expect(labelsFor("en-GB")).toContain("Tonight's Service");
    expect(labelsFor("es-MX")).toContain("Servicio de esta noche");
    expect(labelsFor("es-MX")).toContain("Cerrar sesión");
    expect(labelsFor("fr-CA")).toContain("Service de ce soir");
    expect(labelsFor("fr-CA")).toContain("Clavardage");
  });

  it("localizes the progress badge", () => {
    const badge = (locale: string) =>
      sections({ ...base, locale, readiness: { status: "setup", steps: ["onboarding"] } })[0]
        ?.items[0]?.badge;
    expect(badge("en-US")).toBe("1 of 3");
    expect(badge("es-MX")).toBe("1 de 3");
    expect(badge("fr-CA")).toBe("1 sur 3");
  });

  it("falls back to en-US for an unknown or empty locale", () => {
    expect(resolveLocale("de-DE")).toBe("en-US");
    expect(resolveLocale("")).toBe("en-US");
    expect(resolveLocale("fr-CA")).toBe("fr-CA");
    expect(translate("zz", "nav.items.chat")).toBe("Chat");
  });

  it("interpolates {{params}} and keeps an unknown placeholder visible", () => {
    expect(translate("en-US", "setup.count", { done: 2, total: 3 })).toBe("2 of 3");
    expect(translate("en-US", "setup.count", { done: 2 })).toBe("2 of {{total}}");
  });
});

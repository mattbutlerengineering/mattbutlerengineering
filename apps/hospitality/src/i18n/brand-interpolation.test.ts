import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import enGB from "./catalogs/en-GB.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { browserDeps, createLocaleRuntime } from "./runtime.js";

// The product name follows the serving host (#7709): "eat-sheet" on
// eat-sheet.com, "Matt Butler Engineering" elsewhere. Catalogs carry a
// {{brand}} placeholder the runtime fills, never the name itself.
describe("brand interpolation", () => {
  it.each([
    ["en-US", enUS],
    ["en-GB", enGB],
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ])("%s carries no literal product name", (_tag, catalog) => {
    expect(JSON.stringify(catalog)).not.toContain("Matt Butler Engineering");
  });

  it.each([
    ["Matt Butler Engineering", "© 2026 Matt Butler Engineering"],
    ["eat-sheet", "© 2026 eat-sheet"],
  ])("fills the brand %s into app text", (brand, copyright) => {
    const { i18n } = createLocaleRuntime({ ...browserDeps, brand });
    expect(i18n.t("shell.copyright", { year: 2026 })).toBe(copyright);
    expect(i18n.t("auth.login.documentTitle")).toBe(`Hospitality - ${brand}`);
    expect(i18n.t("shell.dashboardDocumentTitle")).toBe(`Dashboard - ${brand}`);
    expect(i18n.t("publicBooking.poweredBy")).toBe(`Powered by ${brand}`);
    expect(i18n.t("manageReservation.homeLink")).toBe(`Back to ${brand}`);
  });

  it("defaults to the serving host's brand", () => {
    const { i18n } = createLocaleRuntime(browserDeps);
    expect(i18n.t("shell.copyright", { year: 2026 })).toBe("© 2026 Matt Butler Engineering");
  });
});

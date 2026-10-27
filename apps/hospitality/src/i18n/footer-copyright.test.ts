import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";

// Marketing and the other apps read "© <year> Matt Butler Engineering";
// Hospitality must match in every shipped locale.
describe("footer copyright", () => {
  it.each([
    ["en-US", enUS],
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ])("%s names Matt Butler Engineering", (_tag, catalog) => {
    expect(catalog.shell.copyright).toBe("© {{year}} Matt Butler Engineering");
  });
});

import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";

// Marketing and the other apps read "© <year> Matt Butler Engineering";
// Hospitality must match in every shipped locale. The name is the host's brand
// (#7709), filled in by the runtime — see brand-interpolation.test.ts.
describe("footer copyright", () => {
  it.each([
    ["en-US", enUS],
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ])("%s names the brand", (_tag, catalog) => {
    expect(catalog.shell.copyright).toBe("© {{year}} {{brand}}");
  });
});

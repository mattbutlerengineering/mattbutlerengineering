import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";

type Tree = { [key: string]: string | Tree };

/** Dotted leaf path → string, for one catalog subtree. */
function leaves(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>(
    (acc, [key, value]) =>
      typeof value === "string"
        ? { ...acc, [`${prefix}${key}`]: value }
        : { ...acc, ...leaves(value, `${prefix}${key}.`) },
    {}
  );
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!).sort();

const source = leaves(enUS.manageReservation.nightOf as Tree);

describe("manageReservation.nightOf catalog parity", () => {
  it.each([
    ["es-MX", esMX],
    ["fr-CA", frCA],
  ])("%s has exactly the en-US keys, each with the same placeholders", (_tag, catalog) => {
    const translated = leaves(catalog.manageReservation.nightOf as Tree);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort());
    for (const [key, text] of Object.entries(translated)) {
      expect(text.trim(), key).not.toBe("");
      expect(placeholders(text), key).toEqual(placeholders(source[key]!));
    }
  });

  it("names the two signal buttons as the issue words them", () => {
    expect(enUS.manageReservation.nightOf.runningLate).toBe("Running {{minutes}} min late");
    expect(enUS.manageReservation.nightOf.arrived).toBe("We're here");
  });
});

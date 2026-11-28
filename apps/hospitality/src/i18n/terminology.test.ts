import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { AVAILABILITY_GLOSSARY } from "./availability-glossary.js";
import { VENUE_SETUP_GLOSSARY } from "./venue-setup-glossary.js";
import {
  GLOSSARY_TERM_IDS,
  TERM_GROUPS,
  TERM_POSITIONS,
  TERM_RELATIONS,
  termId,
} from "./terminology.js";

/**
 * The Terminology page (#10031) is built from the glossary modules; these tests fail when a
 * glossary entry, or a node of the relationship diagram, has no definition in a catalog.
 */

const CATALOGS = { "en-US": enUS, "es-MX": esMX, "fr-CA": frCA } as const;
type Section = Readonly<Record<string, string>>;

function section(catalog: (typeof CATALOGS)[keyof typeof CATALOGS], name: string): Section {
  return (catalog.terminology as unknown as Record<string, Section>)[name] ?? {};
}

describe("termId", () => {
  it.each([
    ["Close early", "closeEarly"],
    ["Walk-in", "walkIn"],
    ["Regular hours", "regularHours"],
    ["Check a date", "checkADate"],
  ])("turns %s into %s", (term, id) => {
    expect(termId(term)).toBe(id);
  });
});

describe("glossary conflict (#10031)", () => {
  it("names the weekly pattern and the named alternative week once, with the Availability terms", () => {
    const venueSetup = (id: string) => VENUE_SETUP_GLOSSARY.find((e) => e.id === id)?.term["en-US"];
    expect(venueSetup("regularHours")).toBe("Regular hours");
    expect(venueSetup("seasonalHours")).toBe("Seasonal hours");
  });

  it("uses no word the Availability glossary retires as a Venue Setup term", () => {
    const retired = AVAILABILITY_GLOSSARY.flatMap((e) => e.retired).map((w) => w.toLowerCase());
    const terms = VENUE_SETUP_GLOSSARY.map((e) => e.term["en-US"].toLowerCase());
    expect(terms.filter((t) => retired.includes(t))).toEqual([]);
  });
});

describe.each(Object.entries(CATALOGS))("Terminology catalog (%s)", (locale, catalog) => {
  const terms = section(catalog, "terms");
  const definitions = section(catalog, "definitions");

  it("defines every glossary term", () => {
    const missing = GLOSSARY_TERM_IDS.filter((id) => !definitions[id]?.trim());
    expect(missing).toEqual([]);
  });

  it("labels every listed term", () => {
    const listed = TERM_GROUPS.flatMap((g) => g.terms);
    expect(listed.filter(({ id }) => !terms[id]?.trim()).map(({ id }) => id)).toEqual([]);
  });

  it("words every relationship of the diagram", () => {
    const relations = section(catalog, "relations");
    expect(TERM_RELATIONS.filter(({ label }) => !relations[label]?.trim())).toEqual([]);
  });

  it("carries no definition for a term the page does not know", () => {
    const known = new Set(GLOSSARY_TERM_IDS);
    expect(Object.keys(definitions).filter((id) => !known.has(id))).toEqual([]);
    expect(locale).toBeTruthy();
  });
});

describe("walk-in definition agrees with the diagram", () => {
  it.each([
    ["en-US", enUS, /waitlist/i],
    ["es-MX", esMX, /lista de espera/i],
    ["fr-CA", frCA, /liste d'attente/i],
  ] as const)("names the waitlist (%s), as Walk-in joins the Waitlist does", (_l, catalog, re) => {
    expect(section(catalog, "definitions").walkIn).toMatch(re);
    expect(section(catalog, "definitions").walkIn).not.toMatch(
      /straight away|de inmediato|tout de suite/i
    );
  });
});

describe("Terminology terms track the glossaries", () => {
  it("spells each listed term in en-US as its glossary does", () => {
    const terms = section(enUS, "terms");
    const wrong = TERM_GROUPS.flatMap((g) => g.terms).filter(({ id, term }) => terms[id] !== term);
    expect(wrong).toEqual([]);
  });

  it("lists a term once, so a concept both glossaries name appears once", () => {
    const ids = TERM_GROUPS.flatMap((g) => g.terms).map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every Availability and Venue Setup glossary entry", () => {
    const listed = new Set(TERM_GROUPS.flatMap((g) => g.terms).map(({ id }) => id));
    const entries = [
      ...AVAILABILITY_GLOSSARY.map((e) => termId(e.term)),
      ...VENUE_SETUP_GLOSSARY.map((e) => e.id),
    ];
    expect(entries.filter((id) => !listed.has(id))).toEqual([]);
  });
});

describe("the relationship diagram", () => {
  const listed = new Set(TERM_GROUPS.flatMap((g) => g.terms).map(({ id }) => id));
  const definitions = section(enUS, "definitions");
  const nodes = [...new Set(TERM_RELATIONS.flatMap(({ from, to }) => [from, to]))];

  it("draws only terms defined on the page", () => {
    expect(nodes.filter((id) => !listed.has(id) || !definitions[id])).toEqual([]);
  });

  it("places every node, each on its own cell", () => {
    expect(nodes.filter((id) => !TERM_POSITIONS[id])).toEqual([]);
    const cells = nodes.map((id) => TERM_POSITIONS[id]!.join(","));
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("runs no edge behind a node that is not its end", () => {
    const hits = TERM_RELATIONS.flatMap(({ from, to }) =>
      nodes
        .filter((n) => n !== from && n !== to)
        .filter((n) =>
          segmentHitsBox(TERM_POSITIONS[from]!, TERM_POSITIONS[to]!, TERM_POSITIONS[n]!)
        )
        .map((n) => `${from}->${to} behind ${n}`)
    );
    expect(hits).toEqual([]);
  });
});

/** Does the segment a-b cross the box centred on c (grid units, a node is 0.84 x 0.6)? */
function segmentHitsBox(a: readonly number[], b: readonly number[], c: readonly number[]): boolean {
  const box = [c[0]! - 0.42, c[0]! + 0.42, c[1]! - 0.3, c[1]! + 0.3] as const;
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  let t0 = 0;
  let t1 = 1;
  const sides = [
    [-dx, a[0]! - box[0]],
    [dx, box[1] - a[0]!],
    [-dy, a[1]! - box[2]],
    [dy, box[3] - a[1]!],
  ] as const;
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        t0 = Math.max(t0, r);
      } else {
        if (r < t0) return false;
        t1 = Math.min(t1, r);
      }
    }
  }
  return true;
}

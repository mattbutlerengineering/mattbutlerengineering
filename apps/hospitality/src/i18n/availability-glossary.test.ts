import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import enGB from "./catalogs/en-GB.json";
import {
  AVAILABILITY_GLOSSARY,
  AVAILABILITY_NAMESPACES,
  LEGACY_KEYS,
  checkAvailabilityGlossary,
  type GlossaryCatalogs,
} from "./availability-glossary.js";

/**
 * Availability glossary ratchet (availability-hub PRD criterion 12). The fixture is the terms line
 * of docs/features/availability-hub/ux.md: one label per concept, and the words each one retires.
 * LEGACY_KEYS holds the en-US keys that still use a retired word; it can only shrink, and the
 * rename step (breakdown P6.1) empties it.
 */

const REAL: GlossaryCatalogs = { "en-US": enUS, "es-MX": esMX, "fr-CA": frCA, "en-GB": enGB };

/** A small catalog set that uses only glossary terms. */
function clean(): GlossaryCatalogs {
  return {
    "en-US": {
      availability: { title: "Availability", history: { undo: "Undo" } },
      availabilitySchedules: { title: "Seasonal hours" },
      availabilitySpecial: { tab: "Special dates" },
      reservations: { reschedule: "Schedule a new time" },
    },
    "es-MX": {
      availability: { title: "Disponibilidad", history: { undo: "Deshacer" } },
      availabilitySchedules: { title: "Horario de temporada" },
      availabilitySpecial: { tab: "Fechas especiales" },
    },
    "fr-CA": {
      availability: { title: "Disponibilité", history: { undo: "Annuler" } },
      availabilitySchedules: { title: "Heures saisonnières" },
      availabilitySpecial: { tab: "Dates spéciales" },
    },
    "en-GB": {},
  };
}

const NONE: ReadonlySet<string> = new Set();

describe("checkAvailabilityGlossary", () => {
  it("reports nothing for catalogs that use only glossary terms", () => {
    expect(checkAvailabilityGlossary(clean(), NONE)).toEqual([]);
  });

  it("reports a retired word added to an en-US value outside the allowlist", () => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      "en-US": {
        ...base["en-US"],
        availabilitySchedules: { title: "Seasonal hours", fresh: "Add a schedule" },
      },
      "es-MX": {
        ...base["es-MX"],
        availabilitySchedules: { title: "Horario de temporada", fresh: "Agregar" },
      },
      "fr-CA": {
        ...base["fr-CA"],
        availabilitySchedules: { title: "Heures saisonnières", fresh: "Ajouter" },
      },
    };

    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
      {
        kind: "retired-word",
        locale: "en-US",
        key: "availabilitySchedules.fresh",
        detail: "Schedule",
      },
    ]);
    expect(checkAvailabilityGlossary(catalogs, new Set(["availabilitySchedules.fresh"]))).toEqual(
      []
    );
  });

  it.each([
    ["Regular week", "Your Regular week is set"],
    ["Regular week", "the regular week has no hours"],
    ["Schedules", "Other schedules"],
    ["Schedule", "Use schedule…"],
    ["Revert", "Revert"],
    ["Reverted", "Reverted: {{summary}}"],
    ["Reverting", "Reverting this change…"],
    ["Regular weeks", "Compare regular weeks"],
    ["Regular week", "A regular-week change"],
  ])("matches %s in %j, whatever the case", (word, value) => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      "en-US": { ...base["en-US"], availabilitySpecial: { tab: value } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
      { kind: "retired-word", locale: "en-US", key: "availabilitySpecial.tab", detail: word },
    ]);
  });

  it.each([
    "Reschedule for {{date}}",
    "A scheduled change",
    "All dates using {{schedule}}",
    "Changes {{schedules}} · {{dates}}",
    "Regular weekday hours",
    "Close",
  ])("does not match %j", (value) => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      "en-US": { ...base["en-US"], availabilitySpecial: { tab: value } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([]);
  });

  it("ignores retired words outside the availability namespaces", () => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      "en-US": { ...base["en-US"], setup: { caption: "Schedule" } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([]);
  });

  it("reports a retired word under availabilityHub, where the run's new strings go", () => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      "en-US": { ...base["en-US"], availabilityHub: { rows: { seasonal: "Schedules" } } },
      "es-MX": { ...base["es-MX"], availabilityHub: { rows: { seasonal: "Horarios" } } },
      "fr-CA": { ...base["fr-CA"], availabilityHub: { rows: { seasonal: "Horaires" } } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
      {
        kind: "retired-word",
        locale: "en-US",
        key: "availabilityHub.rows.seasonal",
        detail: "Schedules",
      },
    ]);
  });

  it.each(["es-MX", "fr-CA"] as const)(
    "reports a key under availabilityHub that %s lacks",
    (locale) => {
      const base = clean();
      const hub = { availabilityHub: { title: "Availability" } };
      const all: GlossaryCatalogs = {
        ...base,
        "en-US": { ...base["en-US"], ...hub },
        "es-MX": { ...base["es-MX"], ...hub },
        "fr-CA": { ...base["fr-CA"], ...hub },
      };
      const catalogs: GlossaryCatalogs = { ...all, [locale]: base[locale] };
      expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
        { kind: "missing-key", locale, key: "availabilityHub.title", detail: "" },
      ]);
    }
  );

  it.each(["es-MX", "fr-CA"] as const)("reports a key that %s lacks", (locale) => {
    const base = clean();
    const catalogs: GlossaryCatalogs = {
      ...base,
      [locale]: { ...base[locale], availability: { title: "x" } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
      { kind: "missing-key", locale, key: "availability.history.undo", detail: "" },
    ]);
  });

  it("reports a retired word that en-GB reintroduces", () => {
    const catalogs: GlossaryCatalogs = {
      ...clean(),
      "en-GB": { availability: { title: "Schedules" } },
    };
    expect(checkAvailabilityGlossary(catalogs, NONE)).toEqual([
      { kind: "retired-word", locale: "en-GB", key: "availability.title", detail: "Schedules" },
    ]);
  });

  it("reports an allowlisted key that no longer uses a retired word, so the list only shrinks", () => {
    const legacy = new Set(["availability.title", "availability.gone"]);
    expect(checkAvailabilityGlossary(clean(), legacy)).toEqual([
      { kind: "stale-legacy-key", locale: "en-US", key: "availability.title", detail: "" },
      { kind: "stale-legacy-key", locale: "en-US", key: "availability.gone", detail: "" },
    ]);
  });
});

describe("Availability glossary", () => {
  it("covers the availability namespaces, the hub's included", () => {
    expect([...AVAILABILITY_NAMESPACES].sort()).toEqual([
      "availability",
      "availabilityHub",
      "availabilitySchedules",
      "availabilitySpecial",
    ]);
  });

  it("gives each concept one label, and no label is also a retired word", () => {
    const terms = AVAILABILITY_GLOSSARY.map(({ term }) => term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
    const retired = AVAILABILITY_GLOSSARY.flatMap((entry) => entry.retired).map((word) =>
      word.toLowerCase()
    );
    expect(retired.filter((word) => terms.includes(word))).toEqual([]);
  });

  it("holds in the real catalogs, with LEGACY_KEYS as the only exceptions", () => {
    expect(checkAvailabilityGlossary(REAL, LEGACY_KEYS)).toEqual([]);
  });
});

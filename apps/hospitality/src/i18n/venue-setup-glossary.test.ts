import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import enGB from "./catalogs/en-GB.json";

/**
 * Venue Setup glossary (PRD criterion 5). The fixture is the glossary table in
 * docs/features/availability-setup-hierarchy/ux.md: one UI term per resource type, used by every
 * surface that names it — nav items, document titles and breadcrumbs, hub labels, checklist steps
 * and drawer titles. Nav items and route labels are Title Case, hub nodes and buttons sentence
 * case, so exact surfaces compare case-insensitively; the Title Case surfaces also pin the
 * en-US spelling.
 */

type Catalog = Record<string, unknown>;
type LocaleId = "en-US" | "es-MX" | "fr-CA";

const CATALOGS: Readonly<Record<LocaleId, Catalog>> = {
  "en-US": enUS,
  "es-MX": esMX,
  "fr-CA": frCA,
};

function leaves(node: unknown, path = ""): readonly (readonly [string, string])[] {
  if (typeof node === "string") return [[path, node]];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

function lookup(catalog: Catalog, key: string): string {
  const found = leaves(catalog).find(([path]) => path === key);
  if (!found) throw new Error(`missing string at ${key}`);
  return found[1];
}

interface Concept {
  readonly concept: string;
  /** The term per locale, as the glossary (and its translations) spell it. */
  readonly term: Readonly<Record<LocaleId, string>>;
  /** Catalog keys whose whole value is the term (case aside). */
  readonly exact: readonly string[];
  /** Catalog keys whose value contains the term (drawer and dialog titles). */
  readonly contains: readonly string[];
}

const GLOSSARY: readonly Concept[] = [
  {
    concept: "The setup hub",
    term: {
      "en-US": "Venue Setup",
      "es-MX": "Configuración del local",
      "fr-CA": "Configuration de l'établissement",
    },
    exact: [
      "nav.items.venueSetup",
      "layout.routes.setup",
      "setup.hub.title",
      "availability.backToSetup",
    ],
    contains: ["settings.venue.venueSetup", "setup.hub.strip.title"],
  },
  {
    concept: "The calendar page",
    term: { "en-US": "Availability", "es-MX": "Disponibilidad", "fr-CA": "Disponibilité" },
    exact: [
      "nav.items.availability",
      "layout.routes.availability",
      "layout.routes.hours",
      "availability.title",
    ],
    contains: [],
  },
  {
    concept: "The room page",
    term: { "en-US": "Floor Plan", "es-MX": "Plano de sala", "fr-CA": "Plan de salle" },
    exact: [
      "layout.routes.floorPlan",
      "floorPlan.list.title",
      "setup.hub.label.floorPlan",
      "setup.hub.caption.floorPlan",
      "setup.hub.strip.steps.floorPlan",
      "timeline.page.floorPlans",
    ],
    contains: ["floorPlan.editor.backToList"],
  },
  {
    concept: "Weekly pattern",
    term: { "en-US": "Regular week", "es-MX": "Semana habitual", "fr-CA": "Semaine habituelle" },
    exact: [
      "setup.hub.regularWeek",
      "setup.hub.strip.steps.regularWeek",
      "availability.regularWeekLine.heading",
      "availabilitySchedules.regularMarker",
    ],
    contains: [
      "availabilitySchedules.regularWeek.title",
      "setup.hub.actions.setUpRegularWeek",
      "setup.hub.actions.changeRegularWeek",
    ],
  },
  {
    concept: "Named alternative week",
    term: { "en-US": "Schedule", "es-MX": "Horario", "fr-CA": "Horaire" },
    exact: ["setup.hub.caption.schedule"],
    contains: [
      "setup.hub.label.schedules",
      "availabilitySchedules.title",
      "availabilitySchedules.tabSchedules",
      "availabilitySchedules.newTitle",
    ],
  },
  {
    concept: "Bookable period",
    term: { "en-US": "Service", "es-MX": "Servicio", "fr-CA": "Service" },
    exact: ["setup.hub.caption.service"],
    contains: ["availabilitySchedules.compare.title"],
  },
  {
    concept: "One-date difference",
    term: { "en-US": "Special dates", "es-MX": "Fechas especiales", "fr-CA": "Dates spéciales" },
    exact: ["availabilitySpecial.tab", "setup.hub.label.specialDates"],
    contains: [],
  },
  {
    concept: "How guests book",
    term: { "en-US": "Booking", "es-MX": "Reservas", "fr-CA": "Réservations" },
    exact: ["setup.hub.label.booking"],
    contains: ["availability.bookingRules.title"],
  },
  {
    concept: "A part of the floor",
    term: { "en-US": "Section", "es-MX": "Sección", "fr-CA": "Section" },
    exact: ["setup.hub.caption.section"],
    contains: [],
  },
  {
    concept: "One seat group",
    term: { "en-US": "Table", "es-MX": "Mesa", "fr-CA": "Table" },
    exact: ["setup.hub.caption.table"],
    contains: [],
  },
];

/** Case-insensitive, accent-folded, with typographic apostrophes straightened. */
function fold(value: string, locale: LocaleId): string {
  return value
    .toLocaleLowerCase(locale)
    .replace(/[’]/g, "'")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** A stem tolerant of plural/gender endings: the glossary word without a trailing "s". */
function stem(term: string, locale: LocaleId): string {
  return fold(term, locale).replace(/s$/, "");
}

const LOCALES = Object.keys(CATALOGS) as readonly LocaleId[];

describe.each(LOCALES)("Venue Setup glossary (%s)", (locale) => {
  const catalog = CATALOGS[locale];

  it.each(GLOSSARY)("$concept: one term on every surface", ({ term, exact, contains }) => {
    for (const key of exact) {
      expect(fold(lookup(catalog, key), locale), key).toBe(fold(term[locale], locale));
    }
    for (const key of contains) {
      expect(fold(lookup(catalog, key), locale), key).toContain(stem(term[locale], locale));
    }
  });

  it("spells the Title Case nav and title surfaces exactly as the glossary", () => {
    expect(lookup(catalog, "nav.items.venueSetup")).toBe(GLOSSARY[0]!.term[locale]);
    expect(lookup(catalog, "layout.routes.setup")).toBe(GLOSSARY[0]!.term[locale]);
    expect(lookup(catalog, "layout.routes.hours")).toBe(GLOSSARY[1]!.term[locale]);
  });

  it("names Venue Setup identically in the nav before and after launch", () => {
    // One catalog entry serves both readiness states; the progress count is a separate key.
    const navKeys = leaves(catalog.nav).map(([key]) => key);
    expect(navKeys).toContain("items.venueSetup");
    for (const retired of ["venueBasics", "setOperatingHours", "createFloorPlan", "floorPlans"]) {
      expect(navKeys, retired).not.toContain(`items.${retired}`);
    }
  });
});

/** Retired UI terms by locale; a hit anywhere in a catalog value is a failure. */
const RETIRED_ANYWHERE: Readonly<Record<LocaleId, readonly RegExp[]>> = {
  "en-US": [/operating hours/i],
  "es-MX": [/horarios? de (operaci|atenci)/i],
  "fr-CA": [/heures d.ouverture/i],
};

/** Retired as a whole destination name or label (a value that is exactly the term). */
const RETIRED_WHOLE: Readonly<Record<LocaleId, readonly string[]>> = {
  "en-US": ["Setup", "Floor Plans", "Create Floor Plan", "Set Operating Hours"],
  "es-MX": ["Configuración inicial", "Planos de sala", "Crear plano", "Crear plano de sala"],
  "fr-CA": ["Configuration", "Plans de salle", "Créer un plan de salle"],
};

/** Section headings are headings, not destination names (ux.md S-Nav). */
const HEADING_KEYS: ReadonlySet<string> = new Set(["nav.sections.getStarted"]);

/** The sign-in screen's decorative board spells "FLOOR PLANS"; it is not a destination name. */
const DECORATIVE_KEYS: ReadonlySet<string> = new Set(["auth.login.boardPhrases.floorPlans"]);

describe.each(LOCALES)("retired terms are absent (%s)", (locale) => {
  const entries = leaves(CATALOGS[locale]);

  it("has none of the retired phrases in any value", () => {
    const hits = entries.filter(([, value]) =>
      RETIRED_ANYWHERE[locale].some((re) => re.test(value))
    );
    expect(hits.map(([key]) => key)).toEqual([]);
  });

  it("has no value that is only a retired destination name", () => {
    const retired = RETIRED_WHOLE[locale].map((t) => fold(t, locale));
    const hits = entries.filter(
      ([key, value]) =>
        !HEADING_KEYS.has(key) && !DECORATIVE_KEYS.has(key) && retired.includes(fold(value, locale))
    );
    expect(hits.map(([key]) => key)).toEqual([]);
  });

  it("does not use 'Get Started' as a destination (only the section heading)", () => {
    const getStarted = fold(lookup(CATALOGS[locale], "nav.sections.getStarted"), locale);
    const hits = entries.filter(
      ([key, value]) => !HEADING_KEYS.has(key) && fold(value, locale) === getStarted
    );
    expect(hits.map(([key]) => key)).toEqual([]);
  });
});

describe("en-GB overrides", () => {
  it("do not reintroduce a retired term", () => {
    const hits = leaves(enGB).filter(([, value]) =>
      RETIRED_ANYWHERE["en-US"].some((re) => re.test(value))
    );
    expect(hits.map(([key]) => key)).toEqual([]);
  });
});

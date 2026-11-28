import { AVAILABILITY_GLOSSARY } from "./availability-glossary.js";
import { RESERVATIONS_GLOSSARY } from "./reservations-glossary.js";
import { VENUE_SETUP_GLOSSARY } from "./venue-setup-glossary.js";

/**
 * The Terminology page's content (#10031), built from the glossary modules so the page cannot
 * drift from the labels the app uses. Each term has an id; its label and definition live under
 * `terminology.terms.<id>` and `terminology.definitions.<id>` in every catalog, and
 * `terminology.test.ts` fails on a glossary entry with no definition.
 */

export interface TermEntry {
  readonly id: string;
  /** The en-US spelling the catalog's `terminology.terms.<id>` must carry. */
  readonly term: string;
}

export type TermGroupId = "availability" | "venueSetup" | "reservations";

export interface TermGroup {
  readonly id: TermGroupId;
  readonly terms: readonly TermEntry[];
}

/** "Close early" -> "closeEarly"; "Walk-in" -> "walkIn". */
export function termId(term: string): string {
  const [first = "", ...rest] = term.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (
    first.toLowerCase() +
    rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("")
  );
}

const AVAILABILITY_TERMS: readonly TermEntry[] = AVAILABILITY_GLOSSARY.map(({ term }) => ({
  id: termId(term),
  term,
}));

const AVAILABILITY_IDS: ReadonlySet<string> = new Set(AVAILABILITY_TERMS.map(({ id }) => id));

/** A concept both glossaries name is defined once, under Availability. */
const VENUE_SETUP_TERMS: readonly TermEntry[] = VENUE_SETUP_GLOSSARY.filter(
  ({ id }) => !AVAILABILITY_IDS.has(id)
).map(({ id, term }) => ({ id, term: term["en-US"] }));

export const TERM_GROUPS: readonly TermGroup[] = [
  { id: "availability", terms: AVAILABILITY_TERMS },
  { id: "venueSetup", terms: VENUE_SETUP_TERMS },
  { id: "reservations", terms: RESERVATIONS_GLOSSARY },
];

/** Every glossary entry's term id, whether or not the page lists it separately. */
export const GLOSSARY_TERM_IDS: readonly string[] = [
  ...AVAILABILITY_TERMS.map(({ id }) => id),
  ...VENUE_SETUP_GLOSSARY.map(({ id }) => id),
  ...RESERVATIONS_GLOSSARY.map(({ id }) => id),
];

export interface TermRelation {
  readonly from: string;
  readonly to: string;
  /** The key under `terminology.relations` that words the edge, such as "hasMany". */
  readonly label: string;
  /** Drawn dashed: the relationship holds only sometimes. */
  readonly optional?: boolean;
}

/**
 * How the terms relate; each edge is checked against the code and the glossaries (#10031).
 * Venue.venueGroupId, Table.floorPlanId and Table.sectionId are in `@mbe/types`; the rest follow
 * the definitions in docs/domain/ubiquitous-language.md and the availability glossary.
 */
export const TERM_RELATIONS: readonly TermRelation[] = [
  { from: "venueGroup", to: "venue", label: "hasMany" },
  { from: "venue", to: "floorPlan", label: "laidOutIn" },
  { from: "floorPlan", to: "section", label: "dividedInto" },
  { from: "section", to: "table", label: "contains" },
  { from: "venue", to: "service", label: "offers" },
  { from: "service", to: "bookingRules", label: "bookedBy" },
  { from: "venue", to: "regularHours", label: "openOn" },
  { from: "seasonalHours", to: "regularHours", label: "replaces" },
  { from: "specialDate", to: "regularHours", label: "differsFrom" },
  { from: "specialDate", to: "specialHours", label: "runs" },
  { from: "closure", to: "section", label: "closes" },
  { from: "pause", to: "bookingWidget", label: "stops" },
  { from: "guest", to: "bookingWidget", label: "booksThrough" },
  { from: "bookingWidget", to: "reservation", label: "creates" },
  { from: "reservation", to: "service", label: "isFor" },
  { from: "reservation", to: "partySize", label: "has" },
  { from: "reservation", to: "table", label: "seatedAt" },
  { from: "reservation", to: "deposit", label: "mayRequire", optional: true },
  { from: "reservation", to: "noShow", label: "canEndAs", optional: true },
  { from: "guest", to: "walkIn", label: "arrivesAs" },
  { from: "walkIn", to: "waitlist", label: "joins" },
  { from: "waitlist", to: "table", label: "seatedAt" },
];

/**
 * Where each term sits in the diagram: a column and a row of a grid, placed so no edge runs
 * behind another term's box (`terminology.test.ts` checks it).
 */
export const TERM_POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
  venueGroup: [1, 5],
  venue: [2, 5],
  floorPlan: [1, 4],
  section: [0, 4],
  table: [1, 3],
  service: [2, 4],
  bookingRules: [3, 5],
  regularHours: [2, 6],
  seasonalHours: [1, 6],
  specialDate: [3, 6],
  specialHours: [3, 7],
  closure: [0, 5],
  pause: [3, 2],
  bookingWidget: [2, 2],
  guest: [1, 1],
  reservation: [2, 3],
  partySize: [1, 2],
  deposit: [3, 4],
  noShow: [3, 3],
  walkIn: [0, 1],
  waitlist: [0, 2],
};

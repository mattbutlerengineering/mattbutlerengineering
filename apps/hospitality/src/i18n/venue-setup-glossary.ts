/**
 * Venue Setup glossary (PRD criterion 5). The source is the glossary table in
 * docs/features/availability-setup-hierarchy/ux.md: one UI term per resource type, used by every
 * surface that names it. `venue-setup-glossary.test.ts` pins `exact` and `contains` against the
 * catalogs; the Terminology page (`terminology.ts`) defines each term.
 *
 * The weekly pattern and the named alternative week take the Availability glossary's terms,
 * Regular hours and Seasonal hours (#10031), so the two glossaries name each concept once.
 * Surfaces still spelled "Regular week" or "Schedule" are the ratchet in `LEGACY_KEYS`
 * (`availability-glossary.ts`); the rename step that empties it owns them.
 */

export type GlossaryLocale = "en-US" | "es-MX" | "fr-CA";

export interface VenueSetupEntry {
  /** The catalog id of the term's definition under `terminology`. */
  readonly id: string;
  readonly concept: string;
  /** The term per locale, as the glossary (and its translations) spell it. */
  readonly term: Readonly<Record<GlossaryLocale, string>>;
  /** Catalog keys whose whole value is the term (case aside). */
  readonly exact: readonly string[];
  /** Catalog keys whose value contains the term (drawer and dialog titles). */
  readonly contains: readonly string[];
}

export const VENUE_SETUP_GLOSSARY: readonly VenueSetupEntry[] = [
  {
    id: "availability",
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
    id: "floorPlan",
    concept: "The room page",
    term: { "en-US": "Floor Plan", "es-MX": "Plano de sala", "fr-CA": "Plan de salle" },
    exact: [
      "layout.routes.floorPlan",
      "floorPlan.list.title",
      "setup.hub.strip.steps.floorPlan",
      "timeline.page.floorPlans",
    ],
    contains: ["floorPlan.editor.backToList"],
  },
  {
    id: "regularHours",
    concept: "Weekly pattern",
    term: { "en-US": "Regular hours", "es-MX": "Horario habitual", "fr-CA": "Heures habituelles" },
    exact: ["availabilityHub.routes.regularHours"],
    contains: [],
  },
  {
    id: "seasonalHours",
    concept: "Named alternative week",
    term: {
      "en-US": "Seasonal hours",
      "es-MX": "Horarios de temporada",
      "fr-CA": "Heures saisonnières",
    },
    exact: ["availabilityHub.routes.seasonalHours"],
    contains: [],
  },
  {
    id: "service",
    concept: "Bookable period",
    term: { "en-US": "Service", "es-MX": "Servicio", "fr-CA": "Service" },
    exact: [],
    contains: ["availabilitySchedules.compare.title"],
  },
  {
    id: "specialDate",
    concept: "One-date difference",
    term: { "en-US": "Special dates", "es-MX": "Fechas especiales", "fr-CA": "Dates spéciales" },
    exact: ["availabilitySpecial.tab"],
    contains: [],
  },
  {
    id: "booking",
    concept: "How guests book",
    term: { "en-US": "Booking", "es-MX": "Reservas", "fr-CA": "Réservations" },
    exact: [],
    contains: ["availability.bookingRules.title"],
  },
  {
    id: "bookingRules",
    concept: "The rules that decide which times a guest can book",
    term: {
      "en-US": "Booking rules",
      "es-MX": "Reglas de reserva",
      "fr-CA": "Règles de réservation",
    },
    exact: ["availabilityHub.routes.bookingRules"],
    contains: [],
  },
  {
    id: "section",
    concept: "A named part of a floor plan",
    term: { "en-US": "Section", "es-MX": "Sección", "fr-CA": "Section" },
    exact: [],
    contains: [],
  },
];

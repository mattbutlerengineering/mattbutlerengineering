/**
 * "One night of service": the structure behind the signed-out landing.
 *
 * Copy lives in the i18n catalogs under `showcase.*`; this file holds what is
 * not copy: the order of the scenes, when each happens, and whether each claim
 * is shipped or a concept. `shipped` means the app does it in production
 * today; `concept` means it is an idea from `docs/ideas/` that nobody has
 * built. The page prints that status beside the claim, so this file is the one
 * place the honesty line is drawn. The venue, guests and numbers are an
 * invented demo night.
 */

export type ClaimStatus = "shipped" | "concept";

export type ClaimId =
  | "briefing"
  | "dressRehearsal"
  | "publicBooking"
  | "pauseBooking"
  | "openSign"
  | "liveTimeline"
  | "lateBadge"
  | "waitlist"
  | "assistantActions"
  | "confirmUndo"
  | "tonightAutopilot"
  | "guestSignals"
  | "invitation"
  | "manageLink"
  | "nightInNumbers"
  | "lostDemandLedger"
  | "guestPassport"
  | "kitchenAwareBooking"
  | "headlessVenue"
  | "regularsClub";

export interface Claim {
  readonly id: ClaimId;
  readonly status: ClaimStatus;
}

export type SceneId =
  "hero" | "prep" | "doors" | "rush" | "assistant" | "guest" | "close" | "roadmap" | "morning";

export interface Scene {
  readonly id: SceneId;
  /** 24-hour clock time the scene happens at. */
  readonly time: string;
  readonly claims: readonly Claim[];
}

const shipped = (id: ClaimId): Claim => ({ id, status: "shipped" });
const concept = (id: ClaimId): Claim => ({ id, status: "concept" });

export const SCENES: readonly Scene[] = [
  { id: "hero", time: "15:00", claims: [] },
  { id: "prep", time: "15:30", claims: [shipped("briefing"), shipped("dressRehearsal")] },
  {
    id: "doors",
    time: "17:00",
    claims: [shipped("publicBooking"), shipped("pauseBooking"), shipped("openSign")],
  },
  {
    id: "rush",
    time: "19:30",
    claims: [shipped("liveTimeline"), shipped("lateBadge"), shipped("waitlist")],
  },
  {
    id: "assistant",
    time: "20:10",
    claims: [shipped("assistantActions"), shipped("confirmUndo"), concept("tonightAutopilot")],
  },
  {
    id: "guest",
    time: "21:00",
    claims: [shipped("guestSignals"), shipped("invitation"), shipped("manageLink")],
  },
  { id: "close", time: "23:30", claims: [shipped("nightInNumbers"), concept("lostDemandLedger")] },
  { id: "roadmap", time: "00:00", claims: [] },
  { id: "morning", time: "07:00", claims: [] },
];

/** Roadmap ideas, each from the weekly notes in `docs/ideas/`. */
export const ROADMAP: readonly Claim[] = [
  concept("guestPassport"),
  concept("kitchenAwareBooking"),
  concept("headlessVenue"),
  concept("regularsClub"),
];

/** Scenes from doors to after hours play with the lights down. */
const NIGHT_SCENES: ReadonlySet<SceneId> = new Set([
  "doors",
  "rush",
  "assistant",
  "guest",
  "close",
  "roadmap",
]);

export function skyThemeFor(sceneId: SceneId): "light" | "dark" {
  return NIGHT_SCENES.has(sceneId) ? "dark" : "light";
}

/** Catalog keys of the lines the prep scene's departure board cycles through. */
export const BRIEFING_LINE_IDS = ["covers", "allergy", "regular", "rain"] as const;

/**
 * The board scales its cells to fit its width, so 16 characters is the most a
 * phone keeps legible. Every locale's lines must fit.
 */
export const BRIEFING_LINE_MAX = 16;

/** Longest letterboard row a phone holds without wrapping mid-word. */
export const ROADMAP_ROW_MAX = 15;

export type BookingState = "seated" | "confirmed" | "late" | "finished";

export interface RushBooking {
  /** A guest's surname, or null for a walk-in (named from the catalog). */
  readonly party: string | null;
  readonly covers: number;
  /** 15-minute slots after 18:00 at which the booking starts. */
  readonly startSlot: number;
  /** Length of the booking in 15-minute slots. */
  readonly slots: number;
  readonly state: BookingState;
}

export interface RushTable {
  readonly area: "table" | "terrace";
  readonly number: number;
  readonly bookings: readonly RushBooking[];
}

/** Hour marks across the rush chart, 18:00 to 22:00. */
export const RUSH_HOURS: readonly string[] = ["18:00", "19:00", "20:00", "21:00"];

/** The chart is 16 quarter-hour slots wide: 18:00 to 22:00. */
export const RUSH_SLOT_COUNT = 16;

export const RUSH_TABLES: readonly RushTable[] = [
  {
    area: "table",
    number: 2,
    bookings: [
      { party: "Lindqvist", covers: 2, startSlot: 0, slots: 6, state: "finished" },
      { party: "Okafor", covers: 2, startSlot: 7, slots: 7, state: "seated" },
    ],
  },
  {
    area: "table",
    number: 4,
    bookings: [
      { party: "Marchetti", covers: 4, startSlot: 2, slots: 8, state: "seated" },
      { party: "Ito", covers: 4, startSlot: 11, slots: 5, state: "confirmed" },
    ],
  },
  {
    area: "table",
    number: 7,
    bookings: [
      { party: null, covers: 3, startSlot: 1, slots: 5, state: "finished" },
      { party: "Haddad", covers: 6, startSlot: 6, slots: 8, state: "late" },
    ],
  },
  {
    area: "table",
    number: 12,
    bookings: [{ party: "Abara", covers: 5, startSlot: 4, slots: 9, state: "seated" }],
  },
  {
    area: "terrace",
    number: 1,
    bookings: [{ party: "Novak", covers: 2, startSlot: 0, slots: 5, state: "finished" }],
  },
];

export type NightTotalId = "covers" | "turns" | "noShows";

export interface NightTotal {
  readonly id: NightTotalId;
  readonly value: number;
}

export const NIGHT_TOTALS: readonly NightTotal[] = [
  { id: "covers", value: 84 },
  { id: "turns", value: 31 },
  { id: "noShows", value: 1 },
];

export function sceneById(id: SceneId): Scene {
  const scene = SCENES.find((candidate) => candidate.id === id);
  // Invariant: SceneId is the union of the ids in SCENES, so a miss is a
  // typo in this file and should fail loudly at first render.
  if (!scene) throw new Error(`Unknown service-night scene: ${id}`);
  return scene;
}

/** Where a prospect writes to. The same address the site footer's Email link uses. */
export const CONTACT_MAILTO = "mailto:mattbutlerengineering+webapp@gmail.com";

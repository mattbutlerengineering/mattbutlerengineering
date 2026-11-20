/**
 * "One night of service": the data behind the /venues showcase page.
 *
 * Every claim the page makes carries a `status`. `shipped` means the
 * hospitality app does it in production today; `concept` means it is an idea
 * from `docs/ideas/` that nobody has built. The page renders that status next
 * to the claim, so this file is the single place the honesty line is drawn.
 * The venue, guests and numbers are an invented demo night.
 */

export type ClaimStatus = "shipped" | "concept";

export interface Claim {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly status: ClaimStatus;
}

export type SceneId =
  "hero" | "prep" | "doors" | "rush" | "assistant" | "guest" | "close" | "roadmap" | "morning";

export interface Scene {
  readonly id: SceneId;
  /** 24-hour clock time the scene happens at. */
  readonly time: string;
  /** Short scene name shown beside the time. */
  readonly name: string;
  readonly heading: string;
  readonly body: string;
  readonly claims: readonly Claim[];
}

export const SCENES: readonly Scene[] = [
  {
    id: "hero",
    time: "15:00",
    name: "Before service",
    heading: "Tonight, handled.",
    body: "Follow one night of service, from the afternoon briefing to the last table. Each scene is something we have built for venues, or are ready to build for yours.",
    claims: [],
  },
  {
    id: "prep",
    time: "15:30",
    name: "Prep",
    heading: "Walk in already knowing the room.",
    body: "The briefing is waiting before the first cover arrives. Who is coming, how often they have been, where they like to sit and what they cannot eat.",
    claims: [
      {
        id: "briefing",
        label: "Pre-shift briefing",
        detail:
          "Tonight's guests by seating, with visit counts, seating preferences and allergies.",
        status: "shipped",
      },
      {
        id: "dress-rehearsal",
        label: "Dress rehearsal",
        detail:
          "Play tonight's service on your real floor plan before the doors open. Nothing is saved.",
        status: "shipped",
      },
    ],
  },
  {
    id: "doors",
    time: "17:00",
    name: "Doors",
    heading: "The sign comes on. The book is already filling.",
    body: "Guests reserve from your own booking page while you set the room. When the night gets away from you, one tap stops new bookings coming in.",
    claims: [
      {
        id: "public-booking",
        label: "Your own booking page",
        detail: "Guests pick a time, book, add it to their calendar and invite their party.",
        status: "shipped",
      },
      {
        id: "pause-booking",
        label: "Pause online booking",
        detail:
          "Stop new reservations for tonight, close early or block tables. Each one can be undone.",
        status: "shipped",
      },
      {
        id: "open-sign",
        label: "A sign that tells the truth",
        detail:
          "The neon sign on your page follows your real hours, so guests know if you are open.",
        status: "shipped",
      },
    ],
  },
  {
    id: "rush",
    time: "19:30",
    name: "The rush",
    heading: "See the whole room on one screen.",
    body: "Every table against the clock. Seat a walk-in, turn a table or spot the party running late, and every host screen updates as it happens.",
    claims: [
      {
        id: "live-timeline",
        label: "Live table timeline",
        detail: "Tables by time, updated on every screen the moment anything changes.",
        status: "shipped",
      },
      {
        id: "late-badge",
        label: "Late parties flagged",
        detail: "A reservation running 15 minutes behind is marked before anyone has to ask.",
        status: "shipped",
      },
      {
        id: "waitlist",
        label: "Waitlist that remembers",
        detail:
          "Add a party, text them when the table is ready, and returning guests are recognised.",
        status: "shipped",
      },
    ],
  },
  {
    id: "assistant",
    time: "20:10",
    name: "The assistant",
    heading: "Say what you need. It does the rest.",
    body: "The rain starts and the terrace has to close. Tell the assistant in your own words. It shows you what will change, waits for your yes, and you can undo it.",
    claims: [
      {
        id: "assistant-actions",
        label: "Around 40 actions in plain language",
        detail:
          "Seat walk-ins, block tables, mark a dish sold out, change hours, run the waitlist.",
        status: "shipped",
      },
      {
        id: "confirm-undo",
        label: "You stay in charge",
        detail:
          "Anything that changes the book asks you first, and tonight's changes can be undone.",
        status: "shipped",
      },
      {
        id: "tonight-autopilot",
        label: "Tonight Autopilot",
        detail:
          "An assistant that watches the room and proposes the reseats and guest messages itself.",
        status: "concept",
      },
    ],
  },
  {
    id: "guest",
    time: "21:00",
    name: "The guest",
    heading: "Guests keep you posted without a phone call.",
    body: "One link in the confirmation lets a guest change the booking, bring their party in, or tell you they are on the way. The host stand hears a chime.",
    claims: [
      {
        id: "on-my-way",
        label: "On my way",
        detail:
          "On the night, guests tap to say they are coming or running late. The host stand chimes.",
        status: "shipped",
      },
      {
        id: "invitation",
        label: "The invitation",
        detail: "The booker shares a link and the rest of the party replies with a first name.",
        status: "shipped",
      },
      {
        id: "manage-link",
        label: "Change or cancel",
        detail: "Guests manage their own reservation from the link, with no account to create.",
        status: "shipped",
      },
    ],
  },
  {
    id: "close",
    time: "23:30",
    name: "Close",
    heading: "The last table leaves. The night adds up.",
    body: "Covers, table turns and no-shows, counted the moment service ends, with the bookings you had to turn away counted beside them.",
    claims: [
      {
        id: "night-in-numbers",
        label: "The night in numbers",
        detail: "A closing summary on one screen, ready before the chairs go up.",
        status: "concept",
      },
      {
        id: "lost-demand-ledger",
        label: "Lost Demand Ledger",
        detail: "Every booking you could not take, so you can see what a full night cost you.",
        status: "concept",
      },
    ],
  },
  {
    id: "roadmap",
    time: "00:00",
    name: "After hours",
    heading: "What we would build next.",
    body: "These are ideas, not features. Each one is designed and waiting for the venue that wants it first.",
    claims: [],
  },
  {
    id: "morning",
    time: "07:00",
    name: "Morning",
    heading: "Tomorrow is already set.",
    body: "Tell Matt how your venue runs. He will show you what a night like this looks like with your tables, your hours and your guests.",
    claims: [],
  },
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

/**
 * Lines the prep scene's departure board cycles through. The board scales its
 * cells to fit its width, so 16 characters is the most a phone keeps legible.
 */
export const BRIEFING_LINE_MAX = 16;

export const BRIEFING_LINES: readonly string[] = [
  "84 COVERS BOOKED",
  "T12 NUT ALLERGY",
  "OKAFOR 9TH VISIT",
  "TERRACE FULL 8PM",
];

export type BookingState = "seated" | "confirmed" | "late" | "finished";

export interface RushBooking {
  readonly party: string;
  readonly covers: number;
  /** 15-minute slots after 18:00 at which the booking starts. */
  readonly startSlot: number;
  /** Length of the booking in 15-minute slots. */
  readonly slots: number;
  readonly state: BookingState;
}

export interface RushTable {
  readonly label: string;
  readonly bookings: readonly RushBooking[];
}

/** Hour marks across the rush chart, 18:00 to 22:00. */
export const RUSH_HOURS: readonly string[] = ["18:00", "19:00", "20:00", "21:00"];

/** The chart is 16 quarter-hour slots wide: 18:00 to 22:00. */
export const RUSH_SLOT_COUNT = 16;

export const RUSH_TABLES: readonly RushTable[] = [
  {
    label: "Table 2",
    bookings: [
      { party: "Lindqvist", covers: 2, startSlot: 0, slots: 6, state: "finished" },
      { party: "Okafor", covers: 2, startSlot: 7, slots: 7, state: "seated" },
    ],
  },
  {
    label: "Table 4",
    bookings: [
      { party: "Marchetti", covers: 4, startSlot: 2, slots: 8, state: "seated" },
      { party: "Ito", covers: 4, startSlot: 11, slots: 5, state: "confirmed" },
    ],
  },
  {
    label: "Table 7",
    bookings: [
      { party: "Walk-in", covers: 3, startSlot: 1, slots: 5, state: "finished" },
      { party: "Haddad", covers: 6, startSlot: 6, slots: 8, state: "late" },
    ],
  },
  {
    label: "Table 12",
    bookings: [{ party: "Abara", covers: 5, startSlot: 4, slots: 9, state: "seated" }],
  },
  {
    label: "Terrace 1",
    bookings: [
      { party: "Novak", covers: 2, startSlot: 0, slots: 5, state: "finished" },
      { party: "Reyes", covers: 4, startSlot: 9, slots: 7, state: "confirmed" },
    ],
  },
];

/** Roadmap ideas, each from the weekly notes in `docs/ideas/`. */
export const ROADMAP: readonly Claim[] = [
  {
    id: "guest-passport",
    label: "Guest Passport",
    detail: "Your best guests carry their good record to every independent venue they visit.",
    status: "concept",
  },
  {
    id: "kitchen-aware-booking",
    label: "Kitchen-Aware Booking",
    detail:
      "Take the bookings the kitchen can cook, and know tomorrow's prep before the doors open.",
    status: "concept",
  },
  {
    id: "headless-venue",
    label: "Headless Venue",
    detail:
      "Run the restaurant from the AI assistant you already use, straight from your live book.",
    status: "concept",
  },
  {
    id: "regulars-club",
    label: "Regulars Club",
    detail: "Sell your own priority access for Friday night instead of renting your regulars out.",
    status: "concept",
  },
];

export interface NightTotal {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export const NIGHT_TOTALS: readonly NightTotal[] = [
  { id: "covers", label: "Covers served", value: 84 },
  { id: "turns", label: "Table turns", value: 31 },
  { id: "no-shows", label: "No-shows", value: 1 },
];

export function sceneById(id: SceneId): Scene {
  const scene = SCENES.find((candidate) => candidate.id === id);
  // Invariant: SceneId is the union of the ids in SCENES, so a miss is a
  // typo in this file and should fail loudly at first render.
  if (!scene) throw new Error(`Unknown service-night scene: ${id}`);
  return scene;
}

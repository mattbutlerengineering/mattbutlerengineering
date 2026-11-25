import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import {
  OFFERED_CURRENCY_CODES,
  OFFERED_TIMEZONES,
  ROOM_SIZE_IDS,
  ROOM_TEMPLATE_IDS,
} from "@mbe/types";

/**
 * The one tool of the chat-first onboarding route (#9473). It performs no server
 * write and no network call: it shape-checks the model's proposal and returns it,
 * so it streams to the client, which applies it through `applyOnboardingPatch`
 * (apps/hospitality/.../onboarding-chat-patch.ts) and its step validators.
 *
 * Allowed fields mirror that file's `PATCH_FIELDS`; values are strings because
 * the wizard's patch is strings. To open another step, add one entry to
 * `STEP_FIELDS`. The steps the owner finishes by hand (name, Launch) have none.
 */

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const numeral = (max: number) =>
  z
    .string()
    .regex(/^\d+$/, "must be a whole number")
    .refine((v) => Number(v) > 0 && Number(v) <= max, `must be between 1 and ${max}`);

/** `VenueServiceSchema.name` max; the quick-setup card refuses a longer service name. */
const SERVICE_NAME_MAX = 40;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = "(?:mon|tue|wed|thu|fri|sat|sun)";
const DAYS = new RegExp(`^${DAY}(?:,${DAY})*$`);
const clock = z.string().regex(CLOCK, "must be a 24-hour time like 17:30");

/** step -> the fields the model may set on it. The single extension point. */
const STEP_FIELDS = {
  locationTime: {
    // The form's own lists (`@mbe/types`): a value the form cannot show must not reach it.
    ianaTimezone: z.enum(OFFERED_TIMEZONES, { error: "must be one of the offered time zones" }),
    currencyCode: z.enum(OFFERED_CURRENCY_CODES, {
      error: "must be one of the offered currencies",
    }),
  },
  settings: {
    defaultReservationDuration: numeral(480),
    maxPartySize: numeral(500),
    advanceBookingDays: numeral(730),
  },
  // The first service of the hours card; days are shared across it.
  hours: {
    serviceName: z.string().trim().min(1).max(SERVICE_NAME_MAX),
    opens: clock,
    closes: clock,
    lastSeating: clock,
    days: z.string().regex(DAYS, "must be comma-separated days like mon,tue,fri"),
  },
  floorPlan: {
    templateId: z.enum(ROOM_TEMPLATE_IDS, { error: "must be one of the offered room templates" }),
    roomSize: z.enum(ROOM_SIZE_IDS, { error: "must be one of the offered room sizes" }),
  },
} as const;

type StepName = keyof typeof STEP_FIELDS;

/** The field names the model may set (and see in the draft) for a step. */
export function onboardingStepFields(step: StepName): string[] {
  return Object.keys(STEP_FIELDS[step]);
}

export const ONBOARDING_STEPS = Object.keys(STEP_FIELDS) as [StepName, ...StepName[]];

const STEP_SCHEMAS: Record<StepName, z.ZodType<Record<string, string>>> = Object.fromEntries(
  ONBOARDING_STEPS.map((step) => [step, z.object(STEP_FIELDS[step]).partial().strict()])
) as unknown as Record<StepName, z.ZodType<Record<string, string>>>;

export type OnboardingPatch = { step: StepName; data: Record<string, string> };

export type OnboardingPatchProposal =
  { ok: true; patch: OnboardingPatch } | { ok: false; error: string };

export function proposeOnboardingPatch(input: unknown): OnboardingPatchProposal {
  const { step, data } = (input ?? {}) as { step?: unknown; data?: unknown };
  if (typeof step !== "string" || !(step in STEP_SCHEMAS)) {
    return { ok: false, error: "Unknown onboarding step." };
  }
  const parsed = STEP_SCHEMAS[step as StepName].safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "The patch sets no fields." };
  }
  return { ok: true, patch: { step: step as StepName, data: parsed.data } };
}

export const PROPOSE_PATCH_TOOL = "propose_onboarding_patch";

export function createOnboardingTools(): ToolSet {
  return {
    [PROPOSE_PATCH_TOOL]: tool({
      description:
        "Fill form fields on the current onboarding step with values the owner stated. Call at most once per turn, only with values the owner gave. Never guess.",
      inputSchema: z.object({
        step: z.enum(ONBOARDING_STEPS),
        data: z
          .record(z.string(), z.string())
          .describe(
            "Field name to value. locationTime: ianaTimezone (IANA zone, e.g. Europe/Lisbon), currencyCode (ISO 4217, e.g. EUR). settings: defaultReservationDuration (minutes), maxPartySize, advanceBookingDays, as digit strings. hours: serviceName (e.g. Dinner), opens, closes, lastSeating (24-hour HH:mm; a close earlier than the open runs past midnight), days (comma-separated from mon,tue,wed,thu,fri,sat,sun). floorPlan: templateId (blank, fine-dining, casual-bistro, bar-lounge, cafe, banquet-hall, open-kitchen), roomSize (cozy, standard, spacious, grand)."
          ),
      }),
      execute: async (input) => proposeOnboardingPatch(input),
    }),
  };
}

import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

/**
 * The one tool of the chat-first onboarding route (#9473). It performs no server
 * write and no network call: it shape-checks the model's proposal and returns it,
 * so it streams to the client, which applies it through `applyOnboardingPatch`
 * (apps/hospitality/.../onboarding-chat-patch.ts) and its step validators.
 *
 * Allowed fields mirror that file's `PATCH_FIELDS`; values are strings because
 * the wizard's form state is strings. To open another step (#9475), add one entry
 * to `STEP_FIELDS`.
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

/** step -> the fields the model may set on it. The single extension point. */
const STEP_FIELDS = {
  locationTime: {
    ianaTimezone: z
      .string()
      .max(64)
      .refine((v) => v.includes("/") && isTimeZone(v), "must be an IANA time zone"),
    currencyCode: z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 code like USD"),
  },
  settings: {
    defaultReservationDuration: numeral(480),
    maxPartySize: numeral(500),
    advanceBookingDays: numeral(730),
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
            "Field name to value. locationTime: ianaTimezone (IANA zone, e.g. Europe/Lisbon), currencyCode (ISO 4217, e.g. EUR). settings: defaultReservationDuration (minutes), maxPartySize, advanceBookingDays, as digit strings."
          ),
      }),
      execute: async (input) => proposeOnboardingPatch(input),
    }),
  };
}

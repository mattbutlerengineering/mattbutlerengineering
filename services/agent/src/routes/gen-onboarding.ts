/// <reference types="@fastify/rate-limit" />
import { z } from "zod";
import { createGenRoute } from "./gen-route-factory.js";
import {
  ONBOARDING_STEPS,
  PROPOSE_PATCH_TOOL,
  createOnboardingTools,
  isTimeZone,
  onboardingStepFields,
} from "./gen-onboarding-tools.js";
import { failedGenCostMicroUsd } from "../services/gen-spend-ceiling.js";
import {
  addOnboardingSpend,
  getOnboardingCeilingMicroUsd,
  isOnboardingCeilingReached,
} from "../services/gen-onboarding-ceiling.js";

/**
 * Chat-first venue onboarding (#9473, #9476). No venue exists before Launch, so
 * this route takes no venueId; it is authenticated like the other gen routes and
 * its one tool writes nothing (the client applies the streamed patch).
 */

const MAX_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 600;
const MAX_DRAFT_FIELDS = 20;

const GenOnboardingBodySchema = z.object({
  /** Short history only: the current step's exchange, not the whole onboarding. */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_MESSAGE_CHARS),
      })
    )
    .min(1)
    .max(MAX_MESSAGES),
  /** The wizard step the owner is on. */
  step: z.enum(ONBOARDING_STEPS),
  /** The step's current form values, so hand edits reach the model. */
  draft: z
    .record(z.string().max(64), z.string().max(200))
    .refine((d) => Object.keys(d).length <= MAX_DRAFT_FIELDS, {
      message: "draft has too many fields",
    })
    .default({}),
  locale: z.string().max(16).optional(),
  timeZone: z
    .string()
    .max(64)
    .refine(isTimeZone, { message: "timeZone must be an IANA time zone" })
    .optional(),
});

type GenOnboardingBody = z.infer<typeof GenOnboardingBodySchema>;

/** Short on purpose: it is paid for on every turn. */
function onboardingSystemPrompt(parsed: GenOnboardingBody): string {
  // Only this step's own fields reach the prompt: the draft is client-supplied.
  const allowed = onboardingStepFields(parsed.step);
  const draft = Object.entries(parsed.draft)
    .filter(([k]) => allowed.includes(k))
    .map(([k, v]) => `${k}=${v === "" ? "(empty)" : v}`)
    .join(", ");
  return [
    "You help a restaurant owner set up their venue by chat. Be brief and warm.",
    `Current step: ${parsed.step}. Form now: ${draft || "(nothing yet)"}.`,
    parsed.timeZone ? `Owner's browser time zone: ${parsed.timeZone}.` : "",
    parsed.locale ? `Reply in the owner's language (${parsed.locale}).` : "",
    "Rules:",
    `- Take values only from the owner's own words, then call ${PROPOSE_PATCH_TOOL} for the current step. Call it at most once per turn.`,
    "- Never invent a value. If the words leave a field unclear or missing, ask ONE short question instead of guessing.",
    "- Leave fields the owner did not mention out of the patch; do not repeat values already in the form.",
    "- After the tool call, confirm in one short sentence what you filled in.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Worst-case spend held for each in-flight request until its real cost lands. */
const reservations = new WeakMap<object, number>();

export const genOnboardingRoutes = createGenRoute({
  path: "/api/gen/onboarding",
  // Distinct label: the log query for cost per completed onboarding filters on it.
  costLogLabel: "gen-onboarding cost log",
  rateLimit: { max: 40, timeWindow: "1 hour" },
  schema: GenOnboardingBodySchema,
  streamFormat: "ndjson",
  maxSteps: 2,
  getSystemPrompt: (parsed) => onboardingSystemPrompt(parsed),
  // A "continue with the form" answer, not an error: the client falls back to the plain form.
  preflight: (request) => {
    const userId = request.user?.id;
    const ceiling = getOnboardingCeilingMicroUsd();
    if (!userId) return undefined;
    if (isOnboardingCeilingReached(userId, ceiling)) {
      request.log.info({ userId, ceilingMicroUsd: ceiling }, "gen-onboarding ceiling reached");
      return [{ type: "onboarding_ceiling", fallback: "form", ceilingUsd: ceiling / 1_000_000 }];
    }
    // Reserve the worst-case turn so parallel requests from a $0 user cannot all pass;
    // onRunCost swaps the reservation for the real cost.
    const reservation = failedGenCostMicroUsd();
    reservations.set(request, reservation);
    addOnboardingSpend(userId, reservation);
    return undefined;
  },
  onRunCost: (request, costMicroUsd) => {
    const userId = request.user?.id;
    if (!userId) return;
    const reserved = reservations.get(request) ?? 0;
    reservations.delete(request);
    addOnboardingSpend(userId, costMicroUsd - reserved);
    request.log.info({ userId, costMicroUsd }, "gen-onboarding spend");
  },
  getTools: () => createOnboardingTools(),
});

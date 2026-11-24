import type { ChatStreamFn, ChatStreamRequest } from "@mattbutlerengineering/rialto";
import {
  applyOnboardingPatch,
  type OnboardingPatchResult,
  type OnboardingPatchTarget,
} from "./onboarding-chat-patch.js";

/**
 * The chat transport for the onboarding wizard (#9474). It wraps the app's NDJSON stream and
 * turns the two onboarding-specific lines into wizard effects, so rialto's `ChatPanel` stays
 * untouched:
 *
 * - `onboarding_patch` goes through `applyOnboardingPatch` with the wizard's current data. Only
 *   an `applied` result reaches `onApplied`; a `rejected` one becomes chat text; `malformed`
 *   (or a patch for another step than the request) is dropped and reported.
 * - `onboarding_ceiling`, or any stream failure other than an abort, steps the chat aside via
 *   `onFallback` — the owner carries on with the form, so it is never shown as an error.
 *
 * History is also trimmed here, to the server's contract: at most 6 messages of at most 600
 * characters, starting on a user turn.
 */

const MAX_HISTORY_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 600;

type AppliedResult = Extract<OnboardingPatchResult, { kind: "applied" }>;
type RejectedResult = Extract<OnboardingPatchResult, { kind: "rejected" }>;

/** An applied patch, discriminated on `step`, with the field names whose value actually changed. */
export type AppliedPatch = AppliedResult extends infer R
  ? R extends { step: infer S; data: infer D }
    ? { step: S; data: D; changed: string[] }
    : never
  : never;

export interface OnboardingChatStreamDeps {
  base: ChatStreamFn;
  /** The wizard's data at the moment a patch arrives (read lazily, never captured). */
  getTarget: () => OnboardingPatchTarget;
  onApplied: (patch: AppliedPatch) => void;
  onFallback: () => void;
  onMalformed: () => void;
  describeRejection: (result: RejectedResult) => string;
}

interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWireMessage(value: unknown): value is WireMessage {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
}

/** The request with its history cut to the server's per-turn limits. */
function withTrimmedHistory(request: ChatStreamRequest): ChatStreamRequest {
  if (!isRecord(request.body) || !Array.isArray(request.body.messages)) return request;
  const recent = request.body.messages
    .filter(isWireMessage)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  const firstUser = recent.findIndex((m) => m.role === "user");
  const messages = firstUser === -1 ? [] : recent.slice(firstUser);
  return { ...request, body: { ...request.body, messages } };
}

function changedFields(before: object, after: object): string[] {
  const prev = before as Record<string, unknown>;
  return Object.entries(after as Record<string, unknown>)
    .filter(([key, value]) => prev[key] !== value)
    .map(([key]) => key);
}

function isAbort(error: unknown): boolean {
  // A DOMException is not always `instanceof Error` across realms, so read the name.
  return isRecord(error) && error.name === "AbortError";
}

export function createOnboardingChatStream(deps: OnboardingChatStreamDeps): ChatStreamFn {
  function* handlePatch(line: Record<string, unknown>, step: unknown): Generator<unknown> {
    const patch = line.patch;
    const result = applyOnboardingPatch(deps.getTarget(), patch);
    if (result.kind === "malformed" || (isRecord(patch) && patch.step !== step)) {
      deps.onMalformed();
      return;
    }
    if (result.kind === "rejected") {
      yield { type: "text", content: deps.describeRejection(result) };
      return;
    }
    const before = deps.getTarget()[result.step];
    const changed = changedFields(before, result.data);
    deps.onApplied(
      result.step === "locationTime"
        ? { step: "locationTime", data: result.data, changed }
        : { step: "settings", data: result.data, changed }
    );
  }

  return async function* (request) {
    const trimmed = withTrimmedHistory(request);
    const step = isRecord(trimmed.body) ? trimmed.body.step : undefined;
    try {
      for await (const raw of deps.base(trimmed)) {
        if (isRecord(raw) && raw.type === "onboarding_ceiling") {
          deps.onFallback();
          return;
        }
        if (isRecord(raw) && raw.type === "onboarding_patch") {
          yield* handlePatch(raw, step);
          continue;
        }
        yield raw;
      }
    } catch (error) {
      if (isAbort(error)) throw error;
      deps.onFallback();
    }
  };
}

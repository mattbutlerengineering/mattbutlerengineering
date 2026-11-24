import type { ChatStreamFn, ChatStreamRequest } from "@mattbutlerengineering/rialto";
import {
  applyOnboardingPatch,
  onboardingDraftOf,
  withApplied,
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
export type AppliedPatch = AppliedResult & { changed: string[] };

export type FallbackReason = "ceiling" | "error";

export interface OnboardingChatStreamDeps {
  base: ChatStreamFn;
  /** The wizard's data at the moment a patch arrives (read lazily, never captured). */
  getTarget: () => OnboardingPatchTarget;
  onApplied: (patch: AppliedPatch) => void;
  /** `ceiling` retires the chat for good; `error` (network, 429, a stream error) may be retried. */
  onFallback: (reason: FallbackReason) => void;
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

/** The keys of the flat step drafts whose value differs. */
function changedFields(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.entries(after)
    .filter(([key, value]) => before[key] !== value)
    .map(([key]) => key);
}

function isAbort(error: unknown): boolean {
  // A DOMException is not always `instanceof Error` across realms, so read the name.
  return isRecord(error) && error.name === "AbortError";
}

/** Per-response state: the data patches merge over, and whether text has been streamed yet. */
interface ResponseState {
  working: OnboardingPatchTarget | null;
  textSeen: boolean;
}

export function createOnboardingChatStream(deps: OnboardingChatStreamDeps): ChatStreamFn {
  // `state.working` is a copy that every applied patch is merged into, so a second patch in the
  // same response builds on the first instead of on the wizard data from before the response.
  function* handlePatch(
    line: Record<string, unknown>,
    step: unknown,
    state: ResponseState
  ): Generator<unknown> {
    const patch = line.patch;
    const base = state.working ?? deps.getTarget();
    const result = applyOnboardingPatch(base, patch);
    if (result.kind === "malformed" || (isRecord(patch) && patch.step !== step)) {
      deps.onMalformed();
      return;
    }
    if (result.kind === "rejected") {
      // Streamed text has no trailing break; the rejection starts its own paragraph.
      const note = deps.describeRejection(result);
      yield { type: "text", content: state.textSeen ? `\n\n${note}` : note };
      state.textSeen = true;
      return;
    }
    const next = withApplied(base, result);
    const changed = changedFields(
      onboardingDraftOf(result.step, base),
      onboardingDraftOf(result.step, next)
    );
    state.working = next;
    deps.onApplied({ ...result, changed });
  }

  return async function* (request) {
    const trimmed = withTrimmedHistory(request);
    const step = isRecord(trimmed.body) ? trimmed.body.step : undefined;
    const state: ResponseState = { working: null, textSeen: false };
    try {
      for await (const raw of deps.base(trimmed)) {
        if (isRecord(raw) && raw.type === "onboarding_ceiling") {
          deps.onFallback("ceiling");
          return;
        }
        if (isRecord(raw) && raw.type === "onboarding_patch") {
          yield* handlePatch(raw, step, state);
          continue;
        }
        if (isRecord(raw) && raw.type === "text") state.textSeen = true;
        yield raw;
      }
    } catch (error) {
      if (isAbort(error)) throw error;
      deps.onFallback("error");
    }
  };
}

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import { streamNDJSON } from "@mbe/api-client/streaming";
import { reportHandledError } from "@mbe/sentry/react";
import { Button, ChatPanel, Text } from "@mattbutlerengineering/rialto";
import { useMotionPreset } from "@mattbutlerengineering/rialto/providers";
import { detectTimezone } from "./LocationTimeStep.js";
import { onboardingDraftOf, type OnboardingPatchTarget } from "./onboarding-chat-patch.js";
import {
  createOnboardingChatStream,
  type AppliedPatch,
  type FallbackReason,
} from "./onboarding-chat-stream.js";
import { focusFirstFilledField, type FilledItem } from "./useOnboardingChatState.js";
import styles from "./OnboardingChat.module.css";

import type { OnboardingChatStep } from "./onboarding-chat-types.js";

const ONBOARDING_CHAT_API = "/api/gen/onboarding";
// ChatPanel's request body does not use the domain schemas; the server owns the prompt.
const NO_DOMAIN_CONTEXT = { schemas: [] };
const NOOP = () => {};

/** One filled field as a phrase with its unit, e.g. "Reservation length: 90 min". */
function summarize({ field, value }: FilledItem, t: TFunction): string {
  switch (field) {
    case "ianaTimezone":
      return t("onboarding.chat.summary.ianaTimezone", { value });
    case "currencyCode":
      return t("onboarding.chat.summary.currencyCode", { value });
    case "defaultReservationDuration":
      return t("onboarding.chat.summary.defaultReservationDuration", { value });
    case "maxPartySize":
      return t("onboarding.chat.summary.maxPartySize", { value });
    case "advanceBookingDays":
      return Number(value) === 0
        ? t("onboarding.chat.summary.advanceBookingToday")
        : t("onboarding.chat.summary.advanceBookingDays", { count: Number(value) });
    case "serviceName":
    case "opens":
    case "closes":
    case "lastSeating":
    case "days":
    case "templateId":
    case "roomSize":
      return t(`onboarding.chat.summary.${field}`, { value });
  }
}

/** The steps whose form fields carry the "Filled from chat" mark the Review action focuses. */
const MARKED_STEPS: readonly OnboardingChatStep[] = ["locationTime", "settings"];

/** A stable getter for the newest `value`, safe to call from callbacks that outlive a render. */
function useLatest<T>(value: T): () => T {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return useCallback(() => ref.current, []);
}

interface OnboardingChatProps {
  step: OnboardingChatStep;
  /** The wizard's current data: patches merge over it and the step's values ride along as `draft`. */
  target: OnboardingPatchTarget;
  onApplied: (patch: AppliedPatch) => void;
  /** The chat steps aside (cost ceiling or a failed stream); the form carries on. */
  onFallback: (reason: FallbackReason) => void;
  /** What the chat just filled, for the summary under it. Empty when nothing is marked. */
  filled: readonly FilledItem[];
}

/**
 * The lead surface on a chat-supported onboarding step (#9474): rialto's `ChatPanel` over a
 * stream that applies typed patches through the step validator. Nothing is written to the
 * server here; the wizard still saves once, at Launch.
 */
export function OnboardingChat({
  step,
  target,
  onApplied,
  onFallback,
  filled,
}: OnboardingChatProps) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const { reduced } = useMotionPreset();

  // The stream outlives renders (ChatPanel keeps it in a ref), so it reads the wizard's data and
  // the callbacks as they are when a patch arrives, not as they were when it was built.
  const latest = useLatest({ target, onApplied, onFallback });

  const stream = useMemo(
    () =>
      createOnboardingChatStream({
        base: streamNDJSON,
        getTarget: () => latest().target,
        onApplied: (patch) => latest().onApplied(patch),
        onFallback: (reason) => latest().onFallback(reason),
        onMalformed: () =>
          reportHandledError(new Error("Malformed onboarding patch"), "onboarding-chat"),
        describeRejection: (result) =>
          t("onboarding.chat.rejected", { errors: Object.values(result.errors).join("; ") }),
      }),
    [t, latest]
  );

  const getAccessToken = useCallback(() => accessToken, [accessToken]);
  // The server takes the step's values as flat strings (hand edits reach the model that way).
  const draft = useMemo(() => onboardingDraftOf(step, target), [step, target]);
  const browserTimeZone = useMemo(() => detectTimezone(), []);
  const requestContext = useMemo(
    () => ({
      step,
      draft,
      locale: i18n.language,
      // The browser's zone, when it is one the form offers; omitted otherwise.
      ...(browserTimeZone ? { timeZone: browserTimeZone } : {}),
    }),
    [step, draft, i18n.language, browserTimeZone]
  );
  const suggestions = useMemo(() => [t(`onboarding.chat.suggestion.${step}`)], [t, step]);

  return (
    <section className={styles.chat} aria-label={t("onboarding.chat.region")}>
      <Text variant="label">{t("onboarding.chat.heading")}</Text>
      <div className={styles.panel}>
        <ChatPanel
          standalone
          onClose={NOOP}
          api={ONBOARDING_CHAT_API}
          stream={stream}
          domainContext={NO_DOMAIN_CONTEXT}
          getAccessToken={getAccessToken}
          requestContext={requestContext}
          suggestions={suggestions}
        />
      </div>
      {filled.length > 0 && (
        // On a phone the form is below the fold of the chat, so say what changed right here.
        <div className={styles.summary}>
          <Text variant="caption" color="secondary">
            {filled.map((item) => summarize(item, t)).join(" · ")}
          </Text>
          {MARKED_STEPS.includes(step) && (
            <Button
              variant="secondary"
              aria-label={t("onboarding.chat.reviewLabel")}
              onClick={() => focusFirstFilledField(reduced)}
            >
              {t("onboarding.chat.review")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { RoomSizeId, RoomTemplateId } from "@mbe/types";
import type { QuickSetupDraft } from "../availability/quick-setup-draft.js";
import type { FloorPlanDraft } from "./floor-plan-draft.js";
import type { SettingsData } from "./SettingsStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { OnboardingChatStep } from "./onboarding-chat-types.js";
import type { AppliedPatch, FallbackReason } from "./onboarding-chat-stream.js";
import { parseDays, weekdayLabel } from "./onboarding-chat-patch-hours.js";
import {
  onboardingDraftOf,
  withApplied,
  type OnboardingPatchTarget,
} from "./onboarding-chat-patch.js";

/** How long the "Filled from chat" marks (and the summary chip) stay if the owner does nothing. */
const FILLED_MARK_MS = 12000;

const FIELD_LABEL_KEYS = {
  ianaTimezone: "onboarding.chat.fields.ianaTimezone",
  currencyCode: "onboarding.chat.fields.currencyCode",
  defaultReservationDuration: "onboarding.chat.fields.defaultReservationDuration",
  maxPartySize: "onboarding.chat.fields.maxPartySize",
  advanceBookingDays: "onboarding.chat.fields.advanceBookingDays",
  serviceName: "onboarding.chat.fields.serviceName",
  opens: "onboarding.chat.fields.opens",
  closes: "onboarding.chat.fields.closes",
  lastSeating: "onboarding.chat.fields.lastSeating",
  days: "onboarding.chat.fields.days",
  templateId: "onboarding.chat.fields.templateId",
  roomSize: "onboarding.chat.fields.roomSize",
} as const;

export type ChatField = keyof typeof FIELD_LABEL_KEYS;

function isChatField(field: string): field is ChatField {
  return field in FIELD_LABEL_KEYS;
}

/** One field the chat filled, with the value it was given. */
export interface FilledItem {
  field: ChatField;
  value: string;
}

interface FilledFromChat {
  step: OnboardingChatStep;
  items: readonly FilledItem[];
}

/** "mon,tue,sat" as the locale's short weekday names. */
function localizedDays(value: string, locale: string): string {
  const names = (parseDays(value) ?? []).map((day) => weekdayLabel(day, locale, "short"));
  return new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(names);
}

/** The value as the owner will recognise it: a zone as its city, a room by its name, days by locale. */
function displayValue(field: ChatField, value: string, t: TFunction, locale: string): string {
  switch (field) {
    case "ianaTimezone":
      return (value.split("/").at(-1) ?? value).replace(/_/g, " ");
    case "days":
      return localizedDays(value, locale);
    case "templateId":
      // `value` is a validated template id (the patch gate refuses any other).
      return t(`floorPlan.templates.items.${value as RoomTemplateId}.name`);
    case "roomSize":
      return t(`floorPlan.templates.sizes.${value as RoomSizeId}.name`);
    default:
      return value;
  }
}

function itemsOf(
  patch: AppliedPatch,
  target: OnboardingPatchTarget,
  t: TFunction,
  locale: string
): FilledItem[] {
  const values = onboardingDraftOf(patch.step, withApplied(target, patch));
  return patch.changed.filter(isChatField).map((field) => ({
    field,
    value: displayValue(field, values[field] ?? "", t, locale),
  }));
}

/** "Time zone and currency" / "a, b, and c", in the active locale, first letter capitalised. */
function formatFieldList(labels: readonly string[], locale: string): string {
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(labels);
  return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1);
}

interface Options {
  step: OnboardingChatStep | undefined;
  locationTime: LocationTimeData;
  settings: SettingsData;
  hours: QuickSetupDraft;
  floorPlan: FloorPlanDraft;
  /** Writes an applied patch's data into the wizard (the step's own `SET_STEP_DATA`). */
  setStepData: (patch: AppliedPatch) => void;
  announce: (text: string) => void;
}

/**
 * The page-level state of the onboarding chat (#9474, #9475): which steps it has stepped aside
 * from and why, which fields it just filled (marks plus the summary chip), and the announcements.
 */
export function useOnboardingChatState({
  step,
  locationTime,
  settings,
  hours,
  floorPlan,
  setStepData,
  announce,
}: Options) {
  const { t, i18n } = useTranslation();
  const [aside, setAside] = useState<Readonly<Partial<Record<OnboardingChatStep, FallbackReason>>>>(
    {}
  );
  const [filled, setFilled] = useState<FilledFromChat | null>(null);

  const target = useMemo<OnboardingPatchTarget>(
    () => ({ locationTime, settings, hours, floorPlan }),
    [locationTime, settings, hours, floorPlan]
  );

  // The marks are for noticing, not for keeping.
  useEffect(() => {
    if (filled === null) return;
    const timer = setTimeout(() => setFilled(null), FILLED_MARK_MS);
    return () => clearTimeout(timer);
  }, [filled]);

  const onApplied = useCallback(
    (patch: AppliedPatch) => {
      setStepData(patch);
      const items = itemsOf(patch, target, t, i18n.language);
      if (items.length === 0) return;
      setFilled({ step: patch.step, items });
      announce(
        t("onboarding.chat.filledAnnouncement", {
          fields: formatFieldList(
            items.map((item) => t(FIELD_LABEL_KEYS[item.field])),
            i18n.language
          ),
        })
      );
    },
    [setStepData, target, announce, t, i18n.language]
  );

  const onFallback = useCallback(
    (chatStep: OnboardingChatStep, reason: FallbackReason) => {
      setAside((current) => ({ ...current, [chatStep]: reason }));
      announce(t("onboarding.chat.fallbackNote"));
    },
    [announce, t]
  );

  const retry = useCallback((chatStep: OnboardingChatStep) => {
    setAside(({ [chatStep]: _removed, ...rest }) => rest);
  }, []);

  /** The owner changed a step's data by hand: the fields they touched are no longer "from chat". */
  const noteEdit = useCallback(
    <S extends OnboardingChatStep>(editedStep: S, next: OnboardingPatchTarget[S]) => {
      const was = onboardingDraftOf(editedStep, target);
      const now = onboardingDraftOf(editedStep, { ...target, [editedStep]: next });
      const edited = Object.keys(now).filter((key) => was[key] !== now[key]);
      setFilled((current) => {
        if (current === null || current.step !== editedStep) return current;
        const items = current.items.filter((item) => !edited.includes(item.field));
        return items.length === 0 ? null : { ...current, items };
      });
    },
    [target]
  );

  const filledItems = filled !== null && filled.step === step ? filled.items : [];
  return {
    target,
    asideReason: step === undefined ? undefined : aside[step],
    filledItems,
    filledFields: filledItems.map((item) => item.field),
    onApplied,
    onFallback,
    retry,
    noteEdit,
  };
}

/** Moves focus to the first field marked as filled from chat, and brings it into view. */
export function focusFirstFilledField(reducedMotion: boolean): void {
  const mark = document.querySelector<HTMLElement>("[data-filled-from-chat]");
  if (!mark) return;
  // The wrapper takes focus, not the control: rialto's Autocomplete opens its list when focused
  // with text in it, which would cover the form the owner came to review. The next Tab enters it.
  mark.focus({ preventScroll: true });
  mark.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
}

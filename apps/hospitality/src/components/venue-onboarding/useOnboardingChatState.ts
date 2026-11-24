import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsData } from "./SettingsStep.js";
import type { LocationTimeData } from "./LocationTimeStep.js";
import type { OnboardingChatStep } from "./onboarding-chat-types.js";
import type { AppliedPatch, FallbackReason } from "./onboarding-chat-stream.js";
import type { OnboardingPatchTarget } from "./onboarding-chat-patch.js";

/** How long the "Filled from chat" marks (and the summary chip) stay if the owner does nothing. */
const FILLED_MARK_MS = 12000;

const FIELD_LABEL_KEYS = {
  ianaTimezone: "onboarding.chat.fields.ianaTimezone",
  currencyCode: "onboarding.chat.fields.currencyCode",
  defaultReservationDuration: "onboarding.chat.fields.defaultReservationDuration",
  maxPartySize: "onboarding.chat.fields.maxPartySize",
  advanceBookingDays: "onboarding.chat.fields.advanceBookingDays",
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

/** The value as the owner will recognise it: a time zone as its city, the rest as given. */
function displayValue(field: ChatField, value: string): string {
  if (field !== "ianaTimezone") return value;
  const city = value.split("/").at(-1) ?? value;
  return city.replace(/_/g, " ");
}

function itemsOf(patch: AppliedPatch): FilledItem[] {
  const values = patch.data as unknown as Record<string, string>;
  return patch.changed.filter(isChatField).map((field) => ({
    field,
    value: displayValue(field, values[field] ?? ""),
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
  setLocationTime: (data: LocationTimeData) => void;
  setSettings: (data: SettingsData) => void;
  announce: (text: string) => void;
}

/**
 * The page-level state of the onboarding chat (#9474): which steps it has stepped aside from and
 * why, which fields it just filled (marks plus the summary chip), and the announcements.
 */
export function useOnboardingChatState({
  step,
  locationTime,
  settings,
  setLocationTime,
  setSettings,
  announce,
}: Options) {
  const { t, i18n } = useTranslation();
  const [aside, setAside] = useState<Readonly<Partial<Record<OnboardingChatStep, FallbackReason>>>>(
    {}
  );
  const [filled, setFilled] = useState<FilledFromChat | null>(null);

  const target = useMemo<OnboardingPatchTarget>(
    () => ({ locationTime, settings }),
    [locationTime, settings]
  );

  // The marks are for noticing, not for keeping.
  useEffect(() => {
    if (filled === null) return;
    const timer = setTimeout(() => setFilled(null), FILLED_MARK_MS);
    return () => clearTimeout(timer);
  }, [filled]);

  const onApplied = useCallback(
    (patch: AppliedPatch) => {
      if (patch.step === "locationTime") setLocationTime(patch.data);
      else setSettings(patch.data);
      const items = itemsOf(patch);
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
    [setLocationTime, setSettings, announce, t, i18n.language]
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

  /** The owner changed `next` by hand: the fields they touched are no longer "from chat". */
  const noteEdit = useCallback((editedStep: OnboardingChatStep, before: object, next: object) => {
    const was = before as Record<string, unknown>;
    const now = next as Record<string, unknown>;
    const edited = Object.keys(now).filter((key) => was[key] !== now[key]);
    setFilled((current) => {
      if (current === null || current.step !== editedStep) return current;
      const items = current.items.filter((item) => !edited.includes(item.field));
      return items.length === 0 ? null : { ...current, items };
    });
  }, []);

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
  const control = mark?.querySelector<HTMLElement>("input, select, button, [role='combobox']");
  if (!mark || !control) return;
  control.focus({ preventScroll: true });
  // rialto's Autocomplete opens its list when focused with text in it, which would cover the
  // form the owner came to review. Escape closes it without touching the text.
  if (control.getAttribute("role") === "combobox") {
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  mark.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
}

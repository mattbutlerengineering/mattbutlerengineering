import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  emptyService,
  replaceService,
  setSharedDays,
  type QuickSetupDraft,
  type QuickSetupIssue,
} from "./quick-setup-draft.js";
import {
  issuesFor,
  QuickSetupIdScopeContext,
  quickSetupFieldId,
  useQuickSetupFieldId,
} from "./quick-setup-field-helpers.js";
import { DayPicker } from "./quick-setup-fields.js";
import { ServiceRow } from "./QuickSetupServiceRow.js";
import { RegularWeekStrip } from "./RegularWeekStrip.js";
import { useWeekdaySummary } from "./ScheduleFormParts.js";
import styles from "./QuickSetupForm.module.css";

export interface QuickSetupFormProps {
  readonly draft: QuickSetupDraft;
  readonly onChange: (draft: QuickSetupDraft) => void;
  /** Problems to show; the owner decides when (after a save attempt, or live in the wizard). */
  readonly issues: readonly QuickSetupIssue[];
  /** The venue does not exist yet (the onboarding wizard): the strip shows the typed hours only. */
  readonly local?: boolean;
  /**
   * The form in Change regular week's drawer (ux.md S14): no strip beside it, and the shared Days
   * as a one-line summary that opens its controls on "Change days".
   */
  readonly inDrawer?: boolean;
  /** The days belong to where the schedule is used, not to this form (Edit schedule): shown, not changed. */
  readonly fixedDays?: boolean;
  /** The id prefix of this form's fields, for an owner that must find them itself (focus a problem). */
  readonly idScope?: string;
}

function DaysField({ draft, onChange, issues, inDrawer, fixedDays }: QuickSetupFormProps) {
  const fieldId = useQuickSetupFieldId();
  const { t } = useTranslation();
  const summarize = useWeekdaySummary();
  const [changing, setChanging] = useState(false);
  // F1 5: nothing follows the shared days, so there is nothing to ask.
  if (draft.services.length > 0 && draft.services.every((s) => s.days !== null)) {
    return (
      <fieldset className={styles.days} id={fieldId(null, "days")}>
        <legend className={styles.legend}>{t("availability.quickSetup.days")}</legend>
        <Text variant="body" color="secondary">
          {t("availability.quickSetup.everyServiceOwnDays")}
        </Text>
      </fieldset>
    );
  }
  if (fixedDays) {
    return (
      <Text variant="body">
        {t("availability.quickSetup.daysSummary", { days: summarize(draft.days) })}
      </Text>
    );
  }
  const problems = issuesFor(issues, null, "days");
  // No days yet (a New schedule): the picker shows open, as it does once days have a problem.
  if (inDrawer && !changing && problems.length === 0 && draft.days.length > 0) {
    return (
      <Stack direction="row" gap="sm" align="center">
        <Text variant="body">
          {t("availability.quickSetup.daysSummary", { days: summarize(draft.days) })}
        </Text>
        <Button variant="ghost" size="sm" aria-expanded={false} onClick={() => setChanging(true)}>
          {t("availability.quickSetup.changeDays")}
        </Button>
      </Stack>
    );
  }
  return (
    <DayPicker
      id={fieldId(null, "days")}
      legend={t("availability.quickSetup.days")}
      days={draft.days}
      onChange={(days) => onChange(setSharedDays(draft, days))}
      draft={draft}
      problems={problems}
    />
  );
}

/**
 * The S1 form: services (name chips, three times, their own days and hours) over shared days,
 * with the guest preview strip beside it. Controlled; the card and the onboarding wizard each own what happens next.
 */
export function QuickSetupForm({
  draft,
  onChange,
  issues,
  local = false,
  inDrawer = false,
  fixedDays = false,
  idScope,
}: QuickSetupFormProps) {
  const { t } = useTranslation();
  // Field ids carry the form instance: the week panel and the drawer opened from it can hold the
  // same draft (same service ids) at once, and a shared id would hand one form's labels to the other.
  const ownScopeId = useId();
  const scope = idScope ?? ownScopeId;
  // The same sentence twice would change no DOM, so a screen reader would stay silent the second
  // time: `repeat` flips a trailing no-break space to make each announcement a DOM change.
  const [announcement, setAnnouncement] = useState({ message: "", repeat: false });
  const announce = (message: string) =>
    setAnnouncement((last) => ({ message, repeat: !last.repeat }));
  const focusAfterChangeRef = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterChangeRef.current;
    if (id === null) return;
    focusAfterChangeRef.current = null;
    document.getElementById(quickSetupFieldId(id, "name", undefined, scope))?.focus();
  }, [draft.services.length, scope]);

  const addService = () => {
    const service = emptyService(crypto.randomUUID());
    focusAfterChangeRef.current = service.id;
    announce(t("availability.quickSetup.serviceAdded", { n: draft.services.length + 1 }));
    onChange({ ...draft, services: [...draft.services, service] });
  };
  const removeService = (id: string) => {
    announce("");
    // The removed row's controls are gone, so focus goes to the name of the service before it
    // (after it, for the first).
    const at = draft.services.findIndex((s) => s.id === id);
    const neighbour = draft.services[at > 0 ? at - 1 : 1];
    focusAfterChangeRef.current = neighbour?.id ?? null;
    onChange({ ...draft, services: draft.services.filter((s) => s.id !== id) });
  };

  return (
    <QuickSetupIdScopeContext value={scope}>
      <div className={inDrawer ? styles.layoutSingle : styles.layout}>
        <Stack gap="md">
          {draft.services.map((service, index) => (
            <ServiceRow
              draft={draft}
              key={service.id}
              service={service}
              index={index}
              removable={draft.services.length > 1}
              issues={issues}
              onChange={(next) => onChange(replaceService(draft, next))}
              onRemove={() => removeService(service.id)}
              announce={announce}
            />
          ))}
          <div>
            <Button variant="secondary" onClick={addService}>
              {t("availability.quickSetup.addService")}
            </Button>
          </div>
          <DaysField
            draft={draft}
            onChange={onChange}
            issues={issues}
            inDrawer={inDrawer}
            fixedDays={fixedDays}
          />
          <Text className={styles.visuallyHidden} role="status">
            {announcement.message}
            {announcement.repeat ? "\u00a0" : ""}
          </Text>
        </Stack>
        {!inDrawer && (
          <div className={styles.stripColumn}>
            <RegularWeekStrip draft={draft} local={local} />
          </div>
        )}
      </div>
    </QuickSetupIdScopeContext>
  );
}

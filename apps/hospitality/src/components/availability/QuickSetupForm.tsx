import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import {
  emptyService,
  replaceService,
  setSharedDays,
  type QuickSetupDraft,
  type QuickSetupIssue,
} from "./quick-setup-draft.js";
import { issuesFor, quickSetupFieldId } from "./quick-setup-field-helpers.js";
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
}

function DaysField({ draft, onChange, issues, inDrawer }: QuickSetupFormProps) {
  const { t } = useTranslation();
  const summarize = useWeekdaySummary();
  const [changing, setChanging] = useState(false);
  // F1 5: nothing follows the shared days, so there is nothing to ask.
  if (draft.services.length > 0 && draft.services.every((s) => s.days !== null)) {
    return (
      <fieldset className={styles.days} id={quickSetupFieldId(null, "days")}>
        <legend className={styles.legend}>{t("availability.quickSetup.days")}</legend>
        <Text variant="body" color="secondary">
          {t("availability.quickSetup.everyServiceOwnDays")}
        </Text>
      </fieldset>
    );
  }
  const problems = issuesFor(issues, null, "days");
  if (inDrawer && !changing && problems.length === 0) {
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
      id={quickSetupFieldId(null, "days")}
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
}: QuickSetupFormProps) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState("");
  const focusAfterAdd = useRef<string | null>(null);

  useEffect(() => {
    const id = focusAfterAdd.current;
    if (id === null) return;
    focusAfterAdd.current = null;
    document.getElementById(quickSetupFieldId(id, "name"))?.focus();
  }, [draft.services.length]);

  const addService = () => {
    const service = emptyService(crypto.randomUUID());
    focusAfterAdd.current = service.id;
    setAnnouncement(t("availability.quickSetup.serviceAdded", { n: draft.services.length + 1 }));
    onChange({ ...draft, services: [...draft.services, service] });
  };
  const removeService = (id: string) => {
    setAnnouncement("");
    onChange({ ...draft, services: draft.services.filter((s) => s.id !== id) });
  };

  return (
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
            announce={setAnnouncement}
          />
        ))}
        <div>
          <Button variant="secondary" onClick={addService}>
            {t("availability.quickSetup.addService")}
          </Button>
        </div>
        <DaysField draft={draft} onChange={onChange} issues={issues} inDrawer={inDrawer} />
        <Text className={styles.visuallyHidden} role="status">
          {announcement}
        </Text>
      </Stack>
      {!inDrawer && (
        <div className={styles.stripColumn}>
          <RegularWeekStrip draft={draft} local={local} />
        </div>
      )}
    </div>
  );
}

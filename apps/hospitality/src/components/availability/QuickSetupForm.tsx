import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Heading, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
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
import styles from "./QuickSetupForm.module.css";

export interface QuickSetupFormProps {
  readonly draft: QuickSetupDraft;
  readonly onChange: (draft: QuickSetupDraft) => void;
  /** Problems to show; the owner decides when (after a save attempt, or live in the wizard). */
  readonly issues: readonly QuickSetupIssue[];
}

function DaysField({ draft, onChange, issues }: QuickSetupFormProps) {
  const { t } = useTranslation();
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
  return (
    <DayPicker
      id={quickSetupFieldId(null, "days")}
      legend={t("availability.quickSetup.days")}
      days={draft.days}
      onChange={(days) => onChange(setSharedDays(draft, days))}
      draft={draft}
      problems={issuesFor(issues, null, "days")}
    />
  );
}

function GuestPreview({ draft }: { readonly draft: QuickSetupDraft }) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const ready = draft.services.filter(
    (s) => s.name.trim() !== "" && s.opens !== null && s.lastSeating !== null
  );
  return (
    <aside className={styles.preview} aria-label={t("availability.quickSetup.previewTitle")}>
      <Heading level={3}>{t("availability.quickSetup.previewTitle")}</Heading>
      {ready.length === 0 ? (
        <Text variant="body" color="secondary">
          {t("availability.quickSetup.previewEmpty")}
        </Text>
      ) : (
        <ul className={styles.previewList}>
          {ready.map((s) => (
            <li key={s.id}>
              <Text variant="body">
                {t("availability.quickSetup.previewLine", {
                  name: s.name.trim(),
                  first: format.formatLocalTime(s.opens ?? ""),
                  last: format.formatLocalTime(s.lastSeating ?? ""),
                })}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * The S1 form: services (name chips, three times) sharing one set of days, with the guest
 * preview beside it. Controlled; the card and the onboarding wizard each own what happens next.
 */
export function QuickSetupForm({ draft, onChange, issues }: QuickSetupFormProps) {
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
    <div className={styles.layout}>
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
        <DaysField draft={draft} onChange={onChange} issues={issues} />
        <Text className={styles.visuallyHidden} role="status">
          {announcement}
        </Text>
      </Stack>
      <GuestPreview draft={draft} />
    </div>
  );
}

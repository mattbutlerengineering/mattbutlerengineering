import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Heading,
  Input,
  Stack,
  Tag,
  Text,
  TimePicker,
} from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHour } from "../../utils/clock-hour.js";
import {
  SERVICE_NAME_MAX_LENGTH,
  SERVICE_PRESET_IDS,
  applyPreset,
  autoLastSeating,
  emptyService,
  replaceService,
  setServiceDays,
  setServiceTime,
  type QuickSetupDraft,
  type QuickSetupIssue,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { issuesFor, quickSetupFieldId } from "./quick-setup-field-helpers.js";
import { DayPicker, IssueText } from "./quick-setup-fields.js";
import styles from "./QuickSetupForm.module.css";

export interface QuickSetupFormProps {
  readonly draft: QuickSetupDraft;
  readonly onChange: (draft: QuickSetupDraft) => void;
  /** Problems to show; the owner decides when (after a save attempt, or live in the wizard). */
  readonly issues: readonly QuickSetupIssue[];
}

interface TimeFieldProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly field: "opens" | "lastSeating" | "closes";
  readonly label: string;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: ServiceDraft) => void;
}

function TimeField({ draft, service, field, label, issues, onChange }: TimeFieldProps) {
  return (
    <div className={styles.timeField}>
      <TimePicker
        id={quickSetupFieldId(service.id, field)}
        label={label}
        value={service[field]}
        onChange={(value) => onChange(setServiceTime(service, field, value))}
      />
      <IssueText problems={issuesFor(issues, service.id, field)} draft={draft} />
    </div>
  );
}

interface ServiceRowProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly index: number;
  readonly removable: boolean;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: ServiceDraft) => void;
  readonly onRemove: () => void;
}

function ServiceRow({
  draft,
  service,
  index,
  removable,
  issues,
  onChange,
  onRemove,
}: ServiceRowProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const nameProblems = issuesFor(issues, service.id, "name");
  const presetName = (id: (typeof SERVICE_PRESET_IDS)[number]) =>
    t(`availability.quickSetup.presets.${id}`);
  const lastSeating =
    service.closes === null ? null : autoLastSeating(service.closes, service.opens);

  // F1 3: the disclosure is open while the service has days of its own.
  const ownDays = service.days !== null;
  const daysRef = useRef<HTMLFieldSetElement>(null);
  const daysButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggleRef = useRef<"into" | "back" | null>(null);
  useEffect(() => {
    const target = focusAfterToggleRef.current;
    focusAfterToggleRef.current = null;
    if (target === "into") daysRef.current?.querySelector("input")?.focus();
    if (target === "back") daysButtonRef.current?.focus();
  }, [ownDays]);
  const setOwnDays = (open: boolean) => {
    focusAfterToggleRef.current = open ? "into" : "back";
    onChange(setServiceDays(service, open ? [...draft.days] : null));
  };

  return (
    <fieldset className={styles.service}>
      <legend className={styles.legend}>
        {t("availability.quickSetup.serviceN", { n: index + 1 })}
      </legend>
      <Stack gap="sm">
        <div
          className={styles.chips}
          role="group"
          aria-label={t("availability.quickSetup.presetsLabel")}
        >
          {SERVICE_PRESET_IDS.map((id) => (
            <Tag key={id} onClick={() => onChange(applyPreset(service, id, presetName(id)))}>
              {presetName(id)}
            </Tag>
          ))}
        </div>
        <Input
          id={quickSetupFieldId(service.id, "name")}
          label={t("availability.quickSetup.nameLabel")}
          value={service.name}
          maxLength={SERVICE_NAME_MAX_LENGTH}
          error={nameProblems.length > 0}
          onChange={(e) => onChange({ ...service, name: e.target.value })}
        />
        <IssueText problems={nameProblems} draft={draft} />
        <div className={styles.times}>
          <TimeField
            draft={draft}
            service={service}
            field="opens"
            label={t("availability.quickSetup.opens")}
            issues={issues}
            onChange={onChange}
          />
          <TimeField
            draft={draft}
            service={service}
            field="lastSeating"
            label={t("availability.quickSetup.lastSeating")}
            issues={issues}
            onChange={onChange}
          />
          <TimeField
            draft={draft}
            service={service}
            field="closes"
            label={t("availability.quickSetup.closes")}
            issues={issues}
            onChange={onChange}
          />
        </div>
        {service.lastSeatingLinked && lastSeating !== null && (
          <Text variant="caption" color="secondary">
            {t("availability.quickSetup.lastSeatingHint", {
              time: format.formatLocalTime(lastSeating),
              count: clockHour(Number.parseInt(lastSeating, 10) * 60),
            })}
          </Text>
        )}
        <div>
          <Button
            ref={daysButtonRef}
            variant="ghost"
            size="sm"
            aria-expanded={ownDays}
            onClick={() => setOwnDays(!ownDays)}
          >
            {t("availability.quickSetup.differentDays")}
          </Button>
        </div>
        {service.days !== null && (
          <>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setOwnDays(false)}>
                {t("availability.quickSetup.useSharedDays")}
              </Button>
            </div>
            <DayPicker
              id={quickSetupFieldId(service.id, "days")}
              ref={daysRef}
              legend={t("availability.quickSetup.runsOn", {
                service:
                  service.name.trim() || t("availability.quickSetup.serviceN", { n: index + 1 }),
              })}
              days={service.days}
              onChange={(days) => onChange(setServiceDays(service, days))}
              draft={draft}
              problems={issuesFor(issues, service.id, "days")}
            />
          </>
        )}
        {removable && (
          <div>
            <Button variant="ghost" size="sm" onClick={onRemove}>
              {t("availability.quickSetup.removeService", { n: index + 1 })}
            </Button>
          </div>
        )}
      </Stack>
    </fieldset>
  );
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
      onChange={(days) => onChange({ ...draft, days })}
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

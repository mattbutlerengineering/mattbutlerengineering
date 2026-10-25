import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Checkbox,
  Heading,
  Input,
  Stack,
  Tag,
  Text,
  TimePicker,
} from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import {
  EVERY_DAY_SHORTCUT,
  SERVICE_PRESET_IDS,
  WEEKDAY_SHORTCUT,
  WEEKEND_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  applyPreset,
  autoLastSeating,
  emptyService,
  replaceService,
  setServiceTime,
  toggleDay,
  type QuickSetupDraft,
  type QuickSetupField,
  type QuickSetupIssue,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import styles from "./QuickSetupForm.module.css";

/** A fixed Monday: weekday names come from the active locale, never a hand-kept list. */
const SAMPLE_MONDAY = "2026-10-26";
const DAYS_FIELD_ID = "quick-setup-days";

/** The DOM id of a field, so the owner can move focus to the first invalid one. */
export function quickSetupFieldId(serviceId: string | null, field: QuickSetupField | "days") {
  return field === "days" ? DAYS_FIELD_ID : `quick-setup-${serviceId}-${field}`;
}

export interface QuickSetupFormProps {
  readonly draft: QuickSetupDraft;
  readonly onChange: (draft: QuickSetupDraft) => void;
  /** Problems to show; the owner decides when (after a save attempt, or live in the wizard). */
  readonly issues: readonly QuickSetupIssue[];
}

function issuesFor(issues: readonly QuickSetupIssue[], serviceId: string | null, field: string) {
  return issues.filter((i) => i.serviceId === serviceId && i.field === field);
}

function IssueText({ problems }: { readonly problems: readonly QuickSetupIssue[] }) {
  const { t } = useTranslation();
  return problems.map((p) => (
    <Text key={p.code} variant="caption" color="error" role="alert">
      {t(`availability.quickSetup.issues.${p.code}`)}
    </Text>
  ));
}

interface TimeFieldProps {
  readonly service: ServiceDraft;
  readonly field: "opens" | "lastSeating" | "closes";
  readonly label: string;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: ServiceDraft) => void;
}

function TimeField({ service, field, label, issues, onChange }: TimeFieldProps) {
  return (
    <div className={styles.timeField}>
      <TimePicker
        id={quickSetupFieldId(service.id, field)}
        label={label}
        value={service[field]}
        onChange={(value) => onChange(setServiceTime(service, field, value))}
      />
      <IssueText problems={issuesFor(issues, service.id, field)} />
    </div>
  );
}

interface ServiceRowProps {
  readonly service: ServiceDraft;
  readonly index: number;
  readonly removable: boolean;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: ServiceDraft) => void;
  readonly onRemove: () => void;
}

function ServiceRow({ service, index, removable, issues, onChange, onRemove }: ServiceRowProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const nameProblems = issuesFor(issues, service.id, "name");
  const presetName = (id: (typeof SERVICE_PRESET_IDS)[number]) =>
    t(`availability.quickSetup.presets.${id}`);
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
          error={nameProblems.length > 0}
          onChange={(e) => onChange({ ...service, name: e.target.value })}
        />
        <IssueText problems={nameProblems} />
        <div className={styles.times}>
          <TimeField
            service={service}
            field="opens"
            label={t("availability.quickSetup.opens")}
            issues={issues}
            onChange={onChange}
          />
          <TimeField
            service={service}
            field="lastSeating"
            label={t("availability.quickSetup.lastSeating")}
            issues={issues}
            onChange={onChange}
          />
          <TimeField
            service={service}
            field="closes"
            label={t("availability.quickSetup.closes")}
            issues={issues}
            onChange={onChange}
          />
        </div>
        {service.lastSeatingLinked && service.closes !== null && (
          <Text variant="caption" color="secondary">
            {t("availability.quickSetup.lastSeatingHint", {
              time: format.formatLocalTime(autoLastSeating(service.closes)),
            })}
          </Text>
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
  const format = useVenueFormat();
  const shortcuts = [
    { id: "weekdays", days: WEEKDAY_SHORTCUT },
    { id: "weekends", days: WEEKEND_SHORTCUT },
    { id: "everyDay", days: EVERY_DAY_SHORTCUT },
  ] as const;
  return (
    <fieldset className={styles.days} id={DAYS_FIELD_ID} tabIndex={-1}>
      <legend className={styles.legend}>{t("availability.quickSetup.days")}</legend>
      <Stack gap="sm">
        <div className={styles.chips}>
          {shortcuts.map(({ id, days }) => (
            <Button
              key={id}
              variant="secondary"
              size="sm"
              onClick={() => onChange({ ...draft, days })}
            >
              {t(`availability.quickSetup.shortcuts.${id}`)}
            </Button>
          ))}
        </div>
        <div className={styles.dayToggles}>
          {WEEK_DISPLAY_ORDER.map((day, position) => (
            <Checkbox
              key={day}
              label={format.formatCalendarDate(addDays(SAMPLE_MONDAY, position), {
                weekday: "long",
              })}
              checked={draft.days.includes(day)}
              onCheckedChange={() => onChange(toggleDay(draft, day))}
            />
          ))}
        </div>
        <IssueText problems={issuesFor(issues, null, "days")} />
      </Stack>
    </fieldset>
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

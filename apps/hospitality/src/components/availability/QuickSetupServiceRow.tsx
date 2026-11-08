import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHour } from "../../utils/clock-hour.js";
import {
  SERVICE_NAME_MAX_LENGTH,
  SERVICE_PRESET_IDS,
  WEEK_DISPLAY_ORDER,
  addBlock,
  placePreset,
  setBlockDays,
  autoLastSeating,
  effectiveDays,
  removeBlock,
  replaceBlock,
  setServiceDays,
  toggleBlockDay,
  type BlockDayToggle,
  type QuickSetupDraft,
  type QuickSetupIssue,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { issuesFor, useQuickSetupFieldId, useWeekdayName } from "./quick-setup-field-helpers.js";
import { DayPicker, IssueText, TimesRow } from "./quick-setup-fields.js";
import { HoursBlockFieldset } from "./QuickSetupBlock.js";
import styles from "./QuickSetupForm.module.css";

export interface ServiceRowProps {
  readonly draft: QuickSetupDraft;
  readonly service: ServiceDraft;
  readonly index: number;
  readonly removable: boolean;
  readonly issues: readonly QuickSetupIssue[];
  readonly onChange: (next: ServiceDraft) => void;
  readonly onRemove: () => void;
  /** Says something politely to a screen reader (the form's status region). */
  readonly announce: (message: string) => void;
}

/** One service: name chips, name, times, and the two disclosures for its own days and hours. */
export function ServiceRow({
  draft,
  service,
  index,
  removable,
  issues,
  onChange,
  onRemove,
  announce,
}: ServiceRowProps) {
  const fieldId = useQuickSetupFieldId();
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const nameProblems = issuesFor(issues, service.id, "name");
  const presetName = (id: (typeof SERVICE_PRESET_IDS)[number]) =>
    t(`availability.quickSetup.presets.${id}`);
  const lastSeating =
    service.closes === null ? null : autoLastSeating(service.closes, service.opens);
  const serviceName =
    service.name.trim() || t("availability.quickSetup.serviceN", { n: index + 1 });

  // F1 3: the days disclosure is open while the service has days of its own.
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
    onChange(setServiceDays(service, open ? [...draft.days] : null, draft.days));
  };

  // F1 4: a new block takes focus on its first day.
  const hoursButtonRef = useRef<HTMLButtonElement>(null);
  const newBlockRef = useRef<string | null>(null);
  useEffect(() => {
    const id = newBlockRef.current;
    newBlockRef.current = null;
    if (id === null) return;
    document
      .getElementById(fieldId(service.id, "days", id))
      ?.querySelector("input")
      ?.focus();
  }, [service.blocks.length, service.id, fieldId]);
  const daysText = (days: readonly number[]) =>
    WEEK_DISPLAY_ORDER.filter((day) => days.includes(day))
      .map((day) => dayName(day, "short"))
      .join(", ");
  const addHours = () => {
    const id = crypto.randomUUID();
    newBlockRef.current = id;
    announce(t("availability.quickSetup.blockAdded"));
    onChange(addBlock(service, id));
  };
  const applyBlockDays = (result: BlockDayToggle, movedDay: number | null) => {
    const lines = [
      ...(result.moved && movedDay !== null
        ? [t("availability.quickSetup.blockDayMoved", { day: dayName(movedDay) })]
        : []),
      ...result.removed.map((b) =>
        t("availability.quickSetup.blockRemoved", { days: daysText(b.days) })
      ),
    ];
    if (lines.length > 0) announce(lines.join(" "));
    onChange(result.service);
  };
  const toggleBlockDays = (blockId: string, day: number) =>
    applyBlockDays(toggleBlockDay(service, blockId, day), day);
  const setBlockShortcut = (blockId: string, days: readonly number[]) =>
    applyBlockDays(setBlockDays(service, blockId, days, effectiveDays(draft, service)), null);
  const removeHours = (blockId: string) => {
    const block = service.blocks.find((b) => b.id === blockId);
    announce(
      block && block.days.length > 0
        ? t("availability.quickSetup.blockRemoved", { days: daysText(block.days) })
        : t("availability.quickSetup.blockRemovedEmpty")
    );
    onChange(removeBlock(service, blockId));
    hoursButtonRef.current?.focus();
  };
  const offeredDays = effectiveDays(draft, service);

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
            <Tag
              key={id}
              onClick={() => onChange(placePreset(draft, service.id, id, presetName(id)))}
            >
              {presetName(id)}
            </Tag>
          ))}
        </div>
        <Input
          id={fieldId(service.id, "name")}
          label={t("availability.quickSetup.nameLabel")}
          value={service.name}
          maxLength={SERVICE_NAME_MAX_LENGTH}
          error={nameProblems.length > 0}
          onChange={(e) => onChange({ ...service, name: e.target.value })}
        />
        <IssueText problems={nameProblems} draft={draft} />
        <TimesRow
          draft={draft}
          serviceId={service.id}
          times={service}
          issues={issues}
          onChange={onChange}
        />
        {service.lastSeatingLinked && lastSeating !== null && (
          <Text variant="caption" color="secondary">
            {t("availability.quickSetup.lastSeatingHint", {
              time: format.formatLocalTime(lastSeating),
              count: clockHour(Number.parseInt(lastSeating, 10) * 60),
            })}
          </Text>
        )}
        {/* One control at a time: the opener while the service follows the shared Days, and
            "Use the shared days" once it has its own (ux.md F1 3). */}
        {ownDays ? (
          <>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setOwnDays(false)}>
                {t("availability.quickSetup.useSharedDays")}
              </Button>
            </div>
            <DayPicker
              id={fieldId(service.id, "days")}
              ref={daysRef}
              legend={t("availability.quickSetup.runsOn", { service: serviceName })}
              days={service.days}
              onChange={(days) => onChange(setServiceDays(service, days, draft.days))}
              draft={draft}
              problems={issuesFor(issues, service.id, "days")}
            />
          </>
        ) : (
          <div>
            <Button ref={daysButtonRef} variant="ghost" size="sm" onClick={() => setOwnDays(true)}>
              {t("availability.quickSetup.differentDays")}
            </Button>
          </div>
        )}
        <div>
          <Button ref={hoursButtonRef} variant="ghost" size="sm" onClick={addHours}>
            {t("availability.quickSetup.differentHours")}
          </Button>
        </div>
        {service.blocks.map((block) => (
          <HoursBlockFieldset
            key={block.id}
            draft={draft}
            service={service}
            block={block}
            offeredDays={offeredDays}
            serviceName={serviceName}
            issues={issues}
            onChange={(next) => onChange(replaceBlock(service, next))}
            onToggleDay={(day) => toggleBlockDays(block.id, day)}
            onSetDays={(days) => setBlockShortcut(block.id, days)}
            onRemove={() => removeHours(block.id)}
          />
        ))}
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

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Stack,
  TextArea,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import {
  AvailabilityConfigProblemSchema,
  GUEST_MESSAGE_MAX_LENGTH,
  type AvailabilityConfigState,
  type ClosureImpact,
} from "@mbe/types";
import { useCreateClosures, usePreviewClosureImpacts } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  combineImpacts,
  decisionsFor,
  emptyRow,
  ruleItems,
  saveLabelParts,
  rowFieldId,
  validateRows,
  type AddDatesForm,
  type RowField,
  type DateRow,
} from "./add-dates-draft.js";
import { AddDateRow } from "./AddDateRow.js";
import { decisionsReady, isUrgent, outcomeCounts, type ChoiceMap } from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import styles from "./AddSpecialDatesSheet.module.css";

export interface AddSpecialDatesSheetProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
}

const SHARED_MESSAGE_ID = "add-dates-shared-message";

function isVersionConflict(error: unknown): boolean {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  return problem.success && problem.data.code === "version-conflict";
}

function closureFailure(error: unknown, t: TFunction): string {
  return isVersionConflict(error)
    ? t("availability.close.versionConflict")
    : describeApiError(error).detail;
}

/**
 * + Add special date (ux.md F6, S7 "Several dates"): rows of Closed, Special hours or Same as a
 * day, then one Step 2 with a choice per group from every row (a closed day, or hours that
 * shorten a service). The rows save together in one transaction, so a booking is never cancelled
 * for one date while another fails. Manager only.
 */
export function AddSpecialDatesSheet(props: AddSpecialDatesSheetProps) {
  const { venueId, state, timezone, today, onStale, onClose } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const now = useNow();
  const previewImpacts = usePreviewClosureImpacts();
  const createClosures = useCreateClosures();

  const [form, setForm] = useState<AddDatesForm>({
    rows: [emptyRow(crypto.randomUUID(), "")],
    shareMessage: false,
    sharedMessage: "",
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [impacts, setImpacts] = useState<readonly ClosureImpact[]>([]);
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [invalid, setInvalid] = useState<{ key: string; field: RowField } | null>(null);
  const [failure, setFailure] = useState<readonly string[]>([]);
  // One rule id per row and one key per sheet: a retried save never creates a rule twice.
  const [ruleIds] = useState(() => new Map<string, string>());
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Set by a handler that wants focus moved once the render it causes has committed.
  const pendingFocusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const target = id ? document.getElementById(id) : null;
    // A hours row names a wrapper: focus the first control inside it.
    const control = target?.matches("input, textarea, button, select")
      ? target
      : target?.querySelector<HTMLElement>("input, textarea, button, select");
    control?.focus();
  }, [form.rows, invalid]);

  const idFor = (key: string) => {
    if (!ruleIds.has(key)) ruleIds.set(key, crypto.randomUUID());
    return ruleIds.get(key)!;
  };
  const items = ruleItems(form, today, idFor);
  const combined = combineImpacts(impacts);
  const dateCount = form.rows.length;
  const firstDate = combined.groups[0]?.date ?? items[0]?.rule.startsOn ?? today;
  const urgent = isUrgent(
    { startsOn: firstDate, fromMinute: null },
    today,
    minutesOfDayIn(now, timezone)
  );
  const sharedMessageError =
    form.sharedMessage.length > GUEST_MESSAGE_MAX_LENGTH || invalid?.field === "message";
  const busy = previewImpacts.isPending || createClosures.isPending;

  const patchRow = (next: DateRow) => {
    setForm({ ...form, rows: form.rows.map((r) => (r.key === next.key ? next : r)) });
    setInvalid(null);
  };
  // The preview shows the message every closure shares; rows with different messages show none.
  const messages = new Set(items.map((i) => i.rule.guestMessage ?? ""));
  const previewMessage = messages.size === 1 ? [...messages][0]! : "";

  const save = async (found: readonly ClosureImpact[]) => {
    setFailure([]);
    const decisions = decisionsFor(found, choices);
    try {
      const result = await createClosures.mutateAsync({
        venueId,
        idempotencyKey,
        body: {
          expectedVersion: state.version,
          items: items.map((item, i) => ({ rule: item.rule, decisions: decisions[i] ?? [] })),
        },
      });
      const notified = result.results.reduce(
        (n, r) => n + r.outcomes.cancel + r.outcomes.move + r.outcomes.keep_notify,
        0
      );
      toast({
        title: t(
          notified > 0 ? "availabilitySpecial.add.savedNotified" : "availabilitySpecial.add.saved",
          { count: dateCount, notified }
        ),
        variant: "success",
      });
      onClose();
    } catch (error) {
      setFailure([closureFailure(error, t), t("availabilitySpecial.add.nothingCancelled")]);
      if (isVersionConflict(error)) {
        // Reload the config, and ask again from it: the impact and the version are both stale.
        onStale();
        setStep(1);
        setImpacts([]);
        setChoices({});
      }
    }
  };

  const next = async () => {
    const problem = validateRows(form, state.config, today);
    setInvalid(problem);
    if (problem) {
      // ux.md S6: field-level messages; focus moves to the first.
      const row = form.rows.find((r) => r.key === problem.key);
      const field =
        problem.field === "dateMissing"
          ? "date"
          : problem.field === "hours" && row?.kind === "same"
            ? "same"
            : problem.field;
      pendingFocusRef.current =
        field === "message" && form.shareMessage
          ? SHARED_MESSAGE_ID
          : field === "same"
            ? // Rialto Select puts its id on the field and focuses via `<id>-trigger`.
              `${rowFieldId(problem.key, field)}-trigger`
            : rowFieldId(problem.key, field);
      return;
    }
    try {
      const found = await previewImpacts.mutateAsync({
        venueId,
        rules: items.map((i) => i.rule),
      });
      setImpacts(found);
      setChoices({});
      if (found.some((i) => i.groups.length > 0)) setStep(2);
      else await save(found);
    } catch {
      setFailure([t("availability.close.impactError")]);
    }
  };

  const counts = outcomeCounts(combined.groups, choices);
  const label = (() => {
    if (step === 1) return t("availabilitySpecial.add.next");
    const { dates, parts } = saveLabelParts(dateCount, counts);
    if (parts.length === 0) return t("availability.close.button.choose");
    return t("availabilitySpecial.add.saveMixed", {
      count: dates,
      parts: parts
        .map((p) => t(`availability.close.button.part.${p.action}`, { count: p.count }))
        .join(" · "),
    });
  })();

  return (
    <Drawer
      open
      onClose={onClose}
      title={t("availabilitySpecial.add.title")}
      size="wide"
      footer={
        <div className={styles.footer}>
          {step === 2 && (
            <Text variant="caption" color="secondary" className={styles.footerNote}>
              {t("availability.close.step2.irreversible")}
            </Text>
          )}
          <Button variant="secondary" onClick={step === 2 ? () => setStep(1) : onClose}>
            {step === 2 ? t("availability.close.back") : t("availability.close.cancel")}
          </Button>
          <Button
            variant="primary"
            data-testid="add-dates-primary"
            isLoading={busy}
            disabled={step === 2 ? !decisionsReady(combined.groups, choices) : false}
            onClick={() => void (step === 2 ? save(impacts) : next())}
          >
            {label}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <Text variant="caption" color="secondary">
          {t("availability.close.step", { step })}
        </Text>
        {failure.length > 0 && (
          <Alert variant="error" title={t("availability.close.saveError")}>
            {failure.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}
        {step === 1 ? (
          <>
            {form.rows.map((row, index) => (
              <AddDateRow
                key={row.key}
                row={row}
                index={index}
                config={state.config}
                timezone={timezone}
                today={today}
                invalid={invalid?.key === row.key ? invalid.field : null}
                canRemove={form.rows.length > 1}
                messageShared={form.shareMessage}
                onChange={patchRow}
                onRemove={() => setForm({ ...form, rows: form.rows.filter((r) => r !== row) })}
              />
            ))}
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  const added = emptyRow(crypto.randomUUID(), "");
                  pendingFocusRef.current = rowFieldId(added.key, "date");
                  setForm({ ...form, rows: [...form.rows, added] });
                }}
              >
                {t("availabilitySpecial.add.addRow")}
              </Button>
            </div>
            <Checkbox
              label={t("availabilitySpecial.add.shareMessage")}
              checked={form.shareMessage}
              onCheckedChange={(shareMessage) =>
                setForm({
                  ...form,
                  shareMessage,
                  sharedMessage: form.sharedMessage || previewMessage,
                })
              }
            />
            {form.shareMessage && (
              <TextArea
                label={t("availabilitySpecial.add.sharedMessage")}
                id={SHARED_MESSAGE_ID}
                value={form.sharedMessage}
                maxLength={GUEST_MESSAGE_MAX_LENGTH}
                error={sharedMessageError}
                hint={
                  sharedMessageError
                    ? t("availability.close.guestMessageTooLong", {
                        max: GUEST_MESSAGE_MAX_LENGTH,
                      })
                    : undefined
                }
                showOptional
                onChange={(e) => setForm({ ...form, sharedMessage: e.target.value })}
              />
            )}
          </>
        ) : (
          <CloseStepTwo
            impact={combined}
            choices={choices}
            urgent={urgent}
            guestMessage={form.shareMessage ? form.sharedMessage : previewMessage}
            onChoose={(key, choice) => setChoices({ ...choices, [key]: choice })}
          />
        )}
      </Stack>
    </Drawer>
  );
}

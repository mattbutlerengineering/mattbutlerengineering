import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  GUEST_MESSAGE_MAX_LENGTH,
  type AvailabilityConfigState,
  type ClosureImpact,
} from "@mbe/types";
import { useCreateClosures, usePreviewClosureImpacts } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
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
import {
  decisionsReady,
  isUrgent,
  outcomeCounts,
  stepTwoNote,
  stepTwoNoteId,
  type ChoiceMap,
} from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { outcomeSummary } from "./outcome-label.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";
import { useSaveAttempts } from "./use-save-attempts.js";
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

/**
 * + Add special date (ux.md F6, S7 "Several dates"): rows of Closed, Special hours or Same as a
 * day, then one Step 2 with a choice per group from every row (a closed day, or hours that
 * shorten a service). The rows save together in one transaction, so a booking is never cancelled
 * for one date while another fails. Manager only.
 */
export function AddSpecialDatesSheet(props: AddSpecialDatesSheetProps) {
  const viewport = useViewport();
  const { venueId, state, timezone, today, onStale, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
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
  // This sheet's key already committed (a lost response): nothing more is sent from it.
  const [savedEarlier, setSavedEarlier] = useState(false);
  // A save with no answer may have committed: from then on "nothing was cancelled" can be false.
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const attempts = useSaveAttempts(state.config.dateRules, { reload: onStale, onLeave: onClose });
  const { idempotencyKey, earlier } = attempts;
  // One rule id per row per attempt: a retried save never creates a rule twice, and a changed one
  // (a new key) is never taken for the first.
  const [ruleIds] = useState(() => new Map<string, string>());

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

  const idFor = (rowKey: string) => {
    const key = `${idempotencyKey}:${rowKey}`;
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
  // Trimmed, like validateRows: what blocks Next is what the field flags.
  const sharedMessageError = form.sharedMessage.trim().length > GUEST_MESSAGE_MAX_LENGTH;
  const busy = previewImpacts.isPending || createClosures.isPending;

  // After a failed save, any edit is a new attempt: see `useSaveAttempts`.
  const editForm = (next: AddDatesForm) => {
    attempts.edited(form, next);
    setForm(next);
  };
  const patchRow = (next: DateRow) => {
    editForm({ ...form, rows: form.rows.map((r) => (r.key === next.key ? next : r)) });
    setInvalid(null);
  };
  // The preview shows the message every closure shares; rows with different messages show none.
  const messages = new Set(items.map((i) => i.rule.guestMessage ?? ""));
  const previewMessage = messages.size === 1 ? [...messages][0]! : "";

  const save = async (found: readonly ClosureImpact[]) => {
    setFailure([]);
    const decisions = decisionsFor(found, choices);
    attempts.record(
      outcomeSummary(outcomeCounts(combineImpacts(found).groups, choices), t),
      items.map((item) => item.rule.id),
      items.map((item) => item.rule.startsOn)
    );
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
      const refused = refusalOf(error);
      const text = refusalText(refused, t);
      if (refused.kind === "groups-changed") {
        // A group changed since the Manager chose: drop the choices and ask again on the new one.
        setChoices({});
        setFailure([text]);
        try {
          setImpacts(
            await previewImpacts.mutateAsync({ venueId, rules: items.map((i) => i.rule) })
          );
        } catch {
          setFailure([text, t("availability.close.impactError")]);
        }
        return;
      }
      attempts.failed(refused);
      if (refused.kind === "closure-exists") {
        onStale();
        setSavedEarlier(true);
        setFailure([text]);
        return;
      }
      const unknown = outcomeUnknown || (refused.kind === "other" && refused.outcomeUnknown);
      setOutcomeUnknown(unknown);
      setFailure(
        unknown
          ? [t("availabilitySpecial.add.maybeSaved")]
          : [text, t("availabilitySpecial.add.nothingCancelled")]
      );
      if (refused.kind === "version-conflict") {
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

  if (earlier) {
    // Named: the form may show other dates by now, and the notice is about these.
    const dates = earlier.dates
      .map((d) => format.formatCalendarDate(d, { month: "short", day: "numeric" }))
      .join(", ");
    return (
      <Drawer
        open
        onClose={attempts.finish}
        title={t("availabilitySpecial.add.title")}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            <Button variant="primary" onClick={attempts.finish}>
              {t("availability.close.savedEarlier.done")}
            </Button>
          </div>
        }
      >
        {/* The first attempt's choices are what applied; never invite a retry. */}
        <Alert variant="info" title={t("availabilitySpecial.add.savedEarlier.title")}>
          {earlier.summary
            ? t("availabilitySpecial.add.savedEarlier.body", { dates, summary: earlier.summary })
            : t("availabilitySpecial.add.savedEarlier.bodyPlain", { dates })}
        </Alert>
      </Drawer>
    );
  }

  return (
    <>
      <Drawer
        open
        onClose={() => attempts.leave(busy)}
        title={t("availabilitySpecial.add.title")}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            {step === 2 && (
              <Text
                id={stepTwoNoteId}
                variant="caption"
                color="secondary"
                className={styles.footerNote}
              >
                {stepTwoNote(decisionsReady(combined.groups, choices), t)}
              </Text>
            )}
            <Button
              variant="secondary"
              onClick={step === 2 ? () => setStep(1) : () => attempts.leave(busy)}
            >
              {step === 2 ? t("availability.close.back") : t("availability.close.cancel")}
            </Button>
            <Button
              variant="primary"
              data-testid="add-dates-primary"
              aria-describedby={step === 2 ? stepTwoNoteId : undefined}
              isLoading={busy}
              disabled={
                savedEarlier || (step === 2 ? !decisionsReady(combined.groups, choices) : false)
              }
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
                  onRemove={() => editForm({ ...form, rows: form.rows.filter((r) => r !== row) })}
                />
              ))}
              <div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const added = emptyRow(crypto.randomUUID(), "");
                    pendingFocusRef.current = rowFieldId(added.key, "date");
                    editForm({ ...form, rows: [...form.rows, added] });
                  }}
                >
                  {t("availabilitySpecial.add.addRow")}
                </Button>
              </div>
              <Checkbox
                label={t("availabilitySpecial.add.shareMessage")}
                checked={form.shareMessage}
                onCheckedChange={(shareMessage) =>
                  editForm({
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
                  onChange={(e) => editForm({ ...form, sharedMessage: e.target.value })}
                />
              )}
            </>
          ) : (
            <CloseStepTwo
              impact={combined}
              choices={choices}
              urgent={urgent}
              guestMessage={form.shareMessage ? form.sharedMessage : previewMessage}
              onChoose={(key, choice) => {
                attempts.edited(choices[key], choice);
                setChoices({ ...choices, [key]: choice });
              }}
            />
          )}
        </Stack>
      </Drawer>
      <LeaveSaveDialog attempts={attempts} />
    </>
  );
}

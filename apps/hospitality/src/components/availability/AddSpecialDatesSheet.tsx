import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Stack,
  TextArea,
  Text,
} from "@mattbutlerengineering/rialto";
import { GUEST_MESSAGE_MAX_LENGTH, type AvailabilityConfigState } from "@mbe/types";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  combineImpacts,
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
} from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { useAddDatesSession } from "./use-add-dates-session.js";
import styles from "./AddSpecialDatesSheet.module.css";

export interface AddSpecialDatesSheetProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
  /** Special hours on one date: the host opens the day editor on it and closes this sheet. */
  readonly onEditDay: (date: string) => void;
  /** One Closed row per date to start from (the holidays offered on Special dates); else one empty row. */
  readonly initialRows?: readonly PlannedDate[];
  /**
   * With valid initial rows, run Next once on mount and keep the drawer shut until there is
   * something to decide (Step 2) or something went wrong: nothing affected saves straight away.
   */
  readonly autoNext?: boolean;
  /** The success toast's title, in place of the count of dates ("Closed on Thanksgiving, Thu, Nov 26"). */
  readonly savedTitle?: string;
  /** The closures were saved (not cancelled, not refused), called once before the sheet closes. */
  readonly onSaved?: () => void;
}

/** A date the sheet opens on, and what it is ("Thanksgiving"), shown in its row's legend. */
export interface PlannedDate {
  readonly date: string;
  readonly name: string;
}

const SHARED_MESSAGE_ID = "add-dates-shared-message";

/**
 * + Add special date (ux.md F6, S7 "Several dates"): rows of Closed, then one Step 2 with a
 * choice per group from every row. The rows save together in one transaction, so a booking is
 * never cancelled for one date while another fails. Special hours (one date) hands off to the
 * day editor through `onEditDay`. Manager only.
 */
export function AddSpecialDatesSheet(props: AddSpecialDatesSheetProps) {
  const viewport = useViewport();
  const { venueId, state, timezone, today, onStale, onClose, onEditDay, initialRows } = props;
  const { autoNext, savedTitle, onSaved } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const now = useNow();

  const [form, setForm] = useState<AddDatesForm>(() => ({
    rows:
      initialRows && initialRows.length > 0
        ? initialRows.map((r) => emptyRow(crypto.randomUUID(), r.date, r.name))
        : [emptyRow(crypto.randomUUID(), "")],
    shareMessage: false,
    sharedMessage: "",
  }));
  const [step, setStep] = useState<1 | 2>(1);
  const [invalid, setInvalid] = useState<{ key: string; field: RowField } | null>(null);
  const dateCount = form.rows.length;
  const session = useAddDatesSession({
    venueId,
    rules: state.config.dateRules,
    version: state.version,
    itemsOf: () => items,
    dateCount,
    savedTitle,
    onSaved,
    reload: onStale,
    onClose,
    onStale,
    onBackToForm: () => setStep(1),
  });
  const { attempts, impacts, choices, failureLines: failure } = session;
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
    // A date picker names a wrapper: focus the first control inside it.
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
  const firstDate = combined.groups[0]?.date ?? items[0]?.rule.startsOn ?? today;
  const urgent = isUrgent(
    { startsOn: firstDate, fromMinute: null },
    today,
    minutesOfDayIn(now, timezone)
  );
  // Trimmed, like validateRows: what blocks Next is what the field flags.
  const sharedMessageError = form.sharedMessage.trim().length > GUEST_MESSAGE_MAX_LENGTH;
  const { busy } = session;

  // After a failed save, any edit is a new attempt: see `useSaveAttempts`.
  const editForm = (next: AddDatesForm) => {
    session.edited(form, next);
    setForm(next);
  };
  const patchRow = (next: DateRow) => {
    editForm({ ...form, rows: form.rows.map((r) => (r.key === next.key ? next : r)) });
    setInvalid(null);
  };
  // The message each group's guests get is its own row's. `impacts[i]` was asked for `items[i]`.
  const messages = new Set(items.map((i) => i.rule.guestMessage ?? ""));
  const previewMessage = messages.size === 1 ? [...messages][0]! : "";
  const messageByGroup = new Map(
    impacts.flatMap((impact, i) =>
      impact.groups.map((g) => [g.groupKey, items[i]?.rule.guestMessage ?? ""] as const)
    )
  );
  const messageFor = (groupKey: string): string => messageByGroup.get(groupKey) ?? "";

  const next = async () => {
    const problem = validateRows(form, today);
    setInvalid(problem);
    if (problem) {
      // ux.md S6: field-level messages; focus moves to the first. A Special hours row among
      // several dates has no field of its own: focus goes to its date.
      const field = problem.field === "message" ? "message" : "date";
      pendingFocusRef.current =
        field === "message" && form.shareMessage
          ? SHARED_MESSAGE_ID
          : rowFieldId(problem.key, field);
      return;
    }
    // validateRows leaves a Special hours row only as the one dated row.
    const handOff = form.rows.find((r) => r.kind === "hours");
    if (handOff) {
      onEditDay(handOff.date);
      return;
    }
    const found = await session.preview();
    if (!found) return;
    if (found.some((i) => i.groups.length > 0)) setStep(2);
    else await session.submit(found);
  };

  // A holiday sent here to be closed asks its one question (Step 2) only when it has one.
  const autoStartedRef = useRef(false);
  // Reads the form as it was opened; the effect re-runs only when `autoNext` does.
  const startNext = useEffectEvent(() => void next());
  useEffect(() => {
    if (!autoNext || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startNext();
  }, [autoNext]);
  // A save that ended without closing the sheet keeps the drawer: an edit drops the session's
  // failure text, not the sheet.
  const { kind } = session.state;
  const waitingOnAuto =
    autoNext === true &&
    step === 1 &&
    failure.length === 0 &&
    invalid === null &&
    (attempts.tried.length === 0 || kind === "sending" || kind === "saved");
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

  // Nothing to decide yet: no drawer until Step 2 or a failure needs one.
  if (waitingOnAuto) return null;

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
                session.savedEarlier ||
                (step === 2 ? !decisionsReady(combined.groups, choices) : false)
              }
              onClick={() => void (step === 2 ? session.submit() : next())}
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
              {/* "Every date" means nothing with one date. Kept while on, so removing rows down to
                  one never hides the only message field. */}
              {(form.rows.length > 1 || form.shareMessage) && (
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
              )}
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
              venueId={venueId}
              impact={combined}
              choices={choices}
              urgent={urgent}
              guestMessage=""
              messageFor={messageFor}
              onChoose={session.setChoice}
            />
          )}
        </Stack>
      </Drawer>
      <LeaveSaveDialog attempts={attempts} />
    </>
  );
}

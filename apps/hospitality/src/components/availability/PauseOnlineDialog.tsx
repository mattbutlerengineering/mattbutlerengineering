import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import {
  GUEST_MESSAGE_MAX_LENGTH,
  type AvailabilityChangeSummary,
  type AvailabilityConfigState,
  type ClosureResult,
} from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useCreateClosure } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { WEEK_STARTS_ON } from "./calendar-dates.js";
import { settleFocusAfterSave } from "./CloseDialog.js";
import styles from "./CloseDialog.module.css";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import {
  PAUSE_CHOICES,
  pauseOnlineProblem,
  pauseOnlineRule,
  pauseUntilMax,
  type PauseChoice,
  type PauseDraft,
} from "./pause-online-draft.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";
import { useSaveAttempts } from "./use-save-attempts.js";
import { useWinningChangeText } from "./use-winning-change-text.js";

const HOW_LONG_NAME = "pause-how-long";
const START: PauseDraft = { choice: "tonight", until: "", guestMessage: "" };

export interface PauseOnlineDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /**
   * The venue's service date (`currentServiceDate`): past midnight on a night still running it is
   * yesterday's date, so Tonight pauses the night in progress.
   */
  readonly today: string;
  /** Leaves the dialog: Cancel, Escape, or after a save. The caller unmounts it. */
  readonly onClose: () => void;
  /**
   * The pause was saved; called just before `onClose` with the saved change and the sentence that
   * says it ("Online booking paused until tonight ends"). A caller that owns Undo offers it here
   * (`offerUndo(title, saved)` from `useAvailabilityScope`); with no `onSaved` the dialog offers
   * Undo itself.
   */
  readonly onSaved?: (saved: ClosureResult, title: string) => void;
}

interface Failure {
  readonly text: string;
  /** Set on a version conflict: the change that won, `null` when none was recorded. */
  readonly winner?: AvailabilityChangeSummary | null;
}

const shortDate = (date: string, format: Pick<VenueFormat, "formatCalendarDate">) =>
  format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });

/** What the button will do ("Pause until tonight ends"), or what it still needs. */
function buttonText(draft: PauseDraft, today: string, t: TFunction, format: VenueFormat): string {
  if (pauseOnlineProblem(draft, today) === "until") return t("availabilityHub.pause.chooseDate");
  if (draft.choice === "untilDate") {
    return t("availabilityHub.pause.button.untilDate", { date: shortDate(draft.until, format) });
  }
  return t(`availabilityHub.pause.button.${draft.choice}`);
}

/** What was saved, as the toast says it. */
function savedText(draft: PauseDraft, t: TFunction, format: VenueFormat): string {
  return draft.choice === "untilDate"
    ? t("availabilityHub.pause.saved.untilDate", { date: shortDate(draft.until, format) })
    : t(`availabilityHub.pause.saved.${draft.choice}`);
}

/**
 * One save of the pause and its attempts (`useSaveAttempts`): the same pause sent again keeps its
 * rule id and key, so a lost response replays; a changed one after a failure is a new attempt.
 */
function usePauseSave(props: PauseOnlineDialogProps, draft: PauseDraft) {
  const { venueId, state, today, onClose, onSaved } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const createOne = useCreateClosure();
  const refresh = useRefreshAvailability();
  const offerUndo = useAvailabilityUndo();
  const [failure, setFailure] = useState<Failure | null>(null);
  const attempts = useSaveAttempts(state.config.dateRules, { reload: refresh, onLeave: onClose });

  const save = async () => {
    const rule = pauseOnlineRule(draft, attempts.ruleId, today);
    if (!rule) return;
    setFailure(null);
    attempts.record("", [rule.id], [rule.startsOn]);
    try {
      const saved = await createOne.mutateAsync({
        venueId,
        idempotencyKey: attempts.idempotencyKey,
        // A pause holds no booking, so there is nothing to decide.
        body: { expectedVersion: state.version, rule, decisions: [] },
      });
      // A pause tells no guest anything, so it is always a change Undo can take back.
      const title = savedText(draft, t, format);
      if (onSaved) onSaved(saved, title);
      else offerUndo({ venueId, title, saved });
      onClose();
      settleFocusAfterSave();
    } catch (error) {
      const refused = refusalOf(error);
      const exists = refused.kind === "closure-exists";
      setFailure({
        text: exists ? t("availabilityHub.pause.alreadySaved") : refusalText(refused, t),
        ...(refused.kind === "version-conflict" ? { winner: refused.winningChange } : {}),
      });
      attempts.failed(refused);
      // The version that lost must not be sent again; a pause that exists must show.
      if (exists || refused.kind === "version-conflict") refresh();
    }
  };
  return { save, attempts, failure, pending: createOne.isPending };
}

interface PauseFieldsProps {
  readonly draft: PauseDraft;
  readonly today: string;
  readonly tooLong: boolean;
  readonly onChange: (next: PauseDraft) => void;
}

/** How long, the date "Until a date" needs, and the message guests read while it is paused. */
function PauseFields({ draft, today, tooLong, onChange }: PauseFieldsProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  return (
    <Stack gap="md">
      <RadioGroup
        label={t("availabilityHub.pause.howLong")}
        name={HOW_LONG_NAME}
        value={draft.choice}
        onChange={(choice) => onChange({ ...draft, choice: choice as PauseChoice })}
      >
        {PAUSE_CHOICES.map((choice) => (
          <Radio key={choice} value={choice} label={t(`availabilityHub.pause.choice.${choice}`)} />
        ))}
      </RadioGroup>
      {draft.choice === "untilDate" && (
        <DatePicker
          label={t("availabilityHub.pause.untilLabel")}
          value={draft.until || null}
          min={today}
          max={pauseUntilMax(today)}
          locale={format.locale}
          weekStartsOn={WEEK_STARTS_ON}
          onChange={(until) => onChange({ ...draft, until: until ?? "" })}
        />
      )}
      <TextArea
        label={t("availability.close.guestMessage")}
        value={draft.guestMessage}
        maxLength={GUEST_MESSAGE_MAX_LENGTH}
        error={tooLong}
        hint={
          tooLong
            ? t("availability.close.guestMessageTooLong", { max: GUEST_MESSAGE_MAX_LENGTH })
            : undefined
        }
        showOptional
        onChange={(e) => onChange({ ...draft, guestMessage: e.target.value })}
      />
    </Stack>
  );
}

/**
 * Pause online booking, on its own (availability-hub ux.md "Close and Pause dialogs"): how long,
 * with Tonight chosen, and an optional message for guests. One press pauses tonight. Each choice
 * saves one online-only booking closure (`pause-online-draft.ts`); a pause holds no booking, so
 * there is no second step. The caller decides who may open it: a Host is never offered it.
 */
export function PauseOnlineDialog(props: PauseOnlineDialogProps) {
  const { today } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [draft, setDraft] = useState<PauseDraft>(START);
  const { save, attempts, failure, pending } = usePauseSave(props, draft);
  const winnerText = useWinningChangeText(failure?.winner ?? null);
  const savedEarlier = attempts.earlier !== undefined;
  const problem = pauseOnlineProblem(draft, today);

  // Focus opens on the question, on the choice already made; the dialog's own trap has put it
  // inside, on the first control it found.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`input[name="${HOW_LONG_NAME}"]:checked`)?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const change = (next: PauseDraft) => {
    // After a failed save a changed pause is a new attempt (see `useSaveAttempts`).
    attempts.edited(draft, next);
    setDraft(next);
  };
  // Only a save with no definite answer is worth a question: nothing else here is lost by leaving.
  const leave = () => {
    if (pending) return;
    if (attempts.maybeSaved) attempts.leave();
    else attempts.finish();
  };

  return (
    <>
      <Dialog
        open
        onClose={leave}
        title={t("availabilityHub.pause.title")}
        footer={
          <div className={styles.footer}>
            {savedEarlier ? (
              <Button variant="primary" onClick={attempts.finish}>
                {t("availability.close.savedEarlier.done")}
              </Button>
            ) : (
              <>
                <Button variant="secondary" disabled={pending} onClick={leave}>
                  {t("availability.close.cancel")}
                </Button>
                <Button
                  variant="primary"
                  data-testid="pause-primary"
                  isLoading={pending}
                  disabled={problem !== null}
                  onClick={() => void save()}
                >
                  {buttonText(draft, today, t, format)}
                </Button>
              </>
            )}
          </div>
        }
      >
        {savedEarlier && (
          // The first attempt is what applied; later edits did not. Never invite a retry.
          <Alert variant="info" title={t("availabilityHub.pause.savedEarlier.title")}>
            {t("availabilityHub.pause.savedEarlier.body")}
          </Alert>
        )}
        {!savedEarlier && failure && (
          <Alert variant="error" title={t("availabilityHub.pause.saveError")}>
            {failure.text}
            {failure.winner !== undefined && <Text variant="body">{winnerText}</Text>}
          </Alert>
        )}
        {/* A save in flight sends what was chosen: no control may change it meanwhile. */}
        <fieldset className={styles.lock} disabled={pending} hidden={savedEarlier}>
          <PauseFields
            draft={draft}
            today={today}
            tooLong={problem === "guestMessage"}
            onChange={change}
          />
        </fieldset>
      </Dialog>
      <DiscardChangesDialog
        open={attempts.asking}
        date={null}
        title={t("availabilityHub.pause.leave.title")}
        description={t("availabilityHub.pause.leave.description")}
        confirmLabel={t("availability.close.discard.leave")}
        onDiscard={attempts.confirmLeave}
        onKeepEditing={attempts.keepEditing}
      />
    </>
  );
}

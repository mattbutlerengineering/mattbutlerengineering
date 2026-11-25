import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { ClosureDecision, DateRule } from "@mbe/types";
import { useClosureImpact } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import {
  decisionsReady,
  isUrgent,
  outcomeCounts,
  stepTwoNote,
  stepTwoNoteId,
} from "./close-draft.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { outcomeLabel } from "./outcome-label.js";
import { refusalOf } from "./step-two-refusal.js";
import { useDecisionsSession } from "./use-decisions-session.js";
import { useWinningChangeText } from "./use-winning-change-text.js";
import styles from "./CloseDialog.module.css";

export interface TonightDecisionsDialogProps {
  readonly venueId: string;
  /** The Tonight rule the server refused until each affected group has a decision. */
  readonly rule: DateRule;
  /** The config's rules, where a save whose response was lost shows up. */
  readonly rules: readonly DateRule[];
  readonly today: string;
  /** Minute of the service day the new close takes effect. */
  readonly closeAt: number;
  readonly nowMinute: number;
  /** Resends the change with these decisions under this rule id; rejects when refused again. */
  readonly onConfirm: (decisions: ClosureDecision[], ruleId: string) => Promise<void>;
  /** Opens the call list of a close-early that was saved. */
  readonly onCallList: (ruleId: string) => void;
  readonly onClose: () => void;
}

/**
 * Step 2 of the Close flow for a Tonight close-early (ux.md F7.3): the bookings after the new
 * close time, each group needing a decision. It reuses `CloseStepTwo`; the preview is allowed
 * for a Host because it is a Tonight rule (the server decides who may close).
 */
export function TonightDecisionsDialog(props: TonightDecisionsDialogProps) {
  const { venueId, rule, rules, today, closeAt, nowMinute, onConfirm, onClose } = props;
  const { t } = useTranslation();
  const refresh = useRefreshAvailability();
  const format = useVenueFormat();
  const impactQuery = useClosureImpact({ venueId, rule });
  const impact = impactQuery.data ?? null;
  const groups = impact?.groups ?? [];
  // The preview keeps `rule`'s id (`firstRuleId`): only what is sent becomes a new attempt.
  const session = useDecisionsSession<void>({
    rules,
    impact: { data: impact ? [impact] : undefined, refetch: impactQuery.refetch },
    firstRuleId: rule.id,
    format,
    reload: refresh,
    onLeave: onClose,
    send: async (attempt) => {
      try {
        await onConfirm(attempt.decisions[0] ?? [], attempt.ruleId);
      } catch (error) {
        const { kind } = refusalOf(error);
        // The next try is against the version that won, and the calendar on screen is out of date.
        if (kind === "version-conflict" || kind === "closure-exists") refresh();
        throw error;
      }
    },
    onSaved: () => undefined,
  });
  const winnerText = useWinningChangeText(session.winner?.change ?? null);
  const { attempts, choices } = session;
  const { earlier } = attempts;
  const saving = session.state.kind === "sending";
  const maybeSaved = session.state.kind === "settled" && session.state.reason === "maybeSaved";
  // A save that may have gone through says so, whatever the server's sentence was, and keeps
  // saying so after an edit drops the session's own text.
  const failure =
    session.unconfirmed || (maybeSaved && session.failure === null)
      ? t("availability.tonight.decisions.maybeSaved")
      : session.failure;

  if (earlier) {
    const earlierRuleId = earlier.ruleIds[0]!;
    return (
      <Dialog
        open
        onClose={attempts.finish}
        title={t("availability.tonight.decisions.title")}
        footer={
          <div className={styles.footer}>
            {earlier.summary && (
              <Button
                variant="secondary"
                onClick={() => {
                  attempts.finish();
                  props.onCallList(earlierRuleId);
                }}
              >
                {t("availability.tonight.toast.callList")}
              </Button>
            )}
            <Button variant="primary" onClick={attempts.finish}>
              {t("availability.close.savedEarlier.done")}
            </Button>
          </div>
        }
      >
        {/* The first attempt's choices are what applied; never invite a retry. */}
        <Alert variant="info" title={t("availability.close.savedEarlier.title")}>
          {earlier.summary
            ? t("availability.tonight.decisions.savedEarlier.body", { summary: earlier.summary })
            : t("availability.tonight.decisions.savedEarlier.bodyPlain")}
        </Alert>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open
        onClose={() => session.leave()}
        title={t("availability.tonight.decisions.title")}
        footer={
          <div className={styles.footer}>
            <Text
              id={stepTwoNoteId}
              variant="caption"
              color="secondary"
              className={styles.footerNote}
            >
              {stepTwoNote(decisionsReady(groups, choices), t)}
            </Text>
            <Button variant="secondary" disabled={saving} onClick={() => session.leave()}>
              {t("availability.close.cancel")}
            </Button>
            <Button
              variant="primary"
              aria-describedby={stepTwoNoteId}
              onClick={() => void session.submit()}
              isLoading={saving}
              disabled={impact === null || !decisionsReady(groups, choices)}
            >
              {outcomeLabel(outcomeCounts(groups, choices), t)}
            </Button>
          </div>
        }
      >
        {failure && (
          <Alert variant="error" title={t("availability.tonight.error")}>
            {failure}
            {session.winner && <Text variant="body">{winnerText}</Text>}
          </Alert>
        )}
        {impactQuery.error !== null && (
          <>
            <Text variant="body" color="secondary">
              {t("availability.tonight.decisions.impactError")}
            </Text>
            <Button variant="secondary" onClick={() => void impactQuery.refetch()}>
              {t("availability.tonight.decisions.retry")}
            </Button>
          </>
        )}
        {impactQuery.isLoading && <Skeleton variant="text" width="60%" />}
        {impact && (
          <CloseStepTwo
            venueId={venueId}
            impact={impact}
            choices={choices}
            urgent={isUrgent({ startsOn: today, fromMinute: closeAt }, today, nowMinute)}
            guestMessage=""
            onChoose={(key, choice) => {
              session.setChoice(key, choice);
              attempts.setDirty(true);
            }}
          />
        )}
      </Dialog>
      <LeaveSaveDialog
        attempts={attempts}
        maybeSavedDescription={t("availability.tonight.decisions.discardMaybeSaved")}
      />
    </>
  );
}

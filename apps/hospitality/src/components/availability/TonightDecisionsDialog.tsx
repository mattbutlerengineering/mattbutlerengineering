import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Skeleton, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityChangeSummary, ClosureDecision, DateRule } from "@mbe/types";
import { useClosureImpact } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import {
  decisionsReady,
  isUrgent,
  outcomeCounts,
  toDecisions,
  type ChoiceMap,
} from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { LeaveSaveDialog } from "./LeaveSaveDialog.js";
import { outcomeLabel, outcomeSummary } from "./outcome-label.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";
import { useSaveAttempts } from "./use-save-attempts.js";
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
  const impactQuery = useClosureImpact({ venueId, rule });
  const impact = impactQuery.data ?? null;
  const groups = impact?.groups ?? [];
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [failure, setFailure] = useState<string | null>(null);
  // Set on a 409 version conflict: the change that won, `null` when none is recorded.
  const [winner, setWinner] = useState<{
    readonly change: AvailabilityChangeSummary | null;
  } | null>(null);
  const winnerText = useWinningChangeText(winner?.change ?? null);
  const [saving, setSaving] = useState(false);
  // The preview keeps `rule`'s id: only what is sent becomes a new attempt.
  const attempts = useSaveAttempts(rules, {
    firstRuleId: rule.id,
    reload: refresh,
    onLeave: onClose,
  });
  const { earlier } = attempts;

  const save = async () => {
    setSaving(true);
    setFailure(null);
    setWinner(null);
    attempts.record(outcomeSummary(outcomeCounts(groups, choices), t));
    try {
      await onConfirm(toDecisions(groups, choices), attempts.ruleId);
    } catch (error) {
      const refused = refusalOf(error);
      setFailure(refusalText(refused, t));
      if (refused.kind === "groups-changed") {
        // The group changed since the Manager chose: drop the stale choices and load the new one.
        setChoices({});
        void impactQuery.refetch();
        return;
      }
      attempts.failed(refused);
      if (refused.kind === "version-conflict") {
        // The next try is against the version that won, not the one this dialog was opened on.
        setWinner({ change: refused.winningChange });
        refresh();
      } else if (refused.kind === "closure-exists") {
        refresh();
      }
    } finally {
      setSaving(false);
    }
  };

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
        onClose={() => attempts.leave(saving)}
        title={t("availability.tonight.decisions.title")}
        footer={
          <div className={styles.footer}>
            <Text variant="caption" color="secondary" className={styles.footerNote}>
              {t("availability.close.step2.irreversible")}
            </Text>
            <Button variant="secondary" disabled={saving} onClick={() => attempts.leave(saving)}>
              {t("availability.close.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
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
            {winner && <Text variant="body">{winnerText}</Text>}
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
            impact={impact}
            choices={choices}
            urgent={isUrgent({ startsOn: today, fromMinute: closeAt }, today, nowMinute)}
            guestMessage=""
            onChoose={(key, choice) => {
              attempts.edited(choices[key], choice);
              setChoices({ ...choices, [key]: choice });
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

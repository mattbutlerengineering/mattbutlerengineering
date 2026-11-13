import { useEffect, useEffectEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, SegmentedControl, Text } from "@mattbutlerengineering/rialto";
import type { ScopeConflictMode } from "@mbe/types";
import { BlockedReason } from "./ScheduleFormParts.js";
import styles from "./EditorSaveBar.module.css";

/**
 * What a save reaches, said in the Save label: the number of dates it writes, or the date it
 * applies from (already formatted for the venue).
 */
export type SaveReach =
  | { readonly kind: "dates"; readonly count: number }
  | { readonly kind: "from"; readonly date: string };

/** Dates the save reaches that already have special hours, and what happens to them. */
export interface SpecialHoursChoice {
  readonly count: number;
  readonly value: ScopeConflictMode;
  readonly onChange: (mode: ScopeConflictMode) => void;
}

export interface EditorSaveBarProps {
  /** Something has changed. Until then Save is disabled and the bar is not pinned. */
  readonly dirty: boolean;
  /** A save is in flight: both buttons hold. */
  readonly saving?: boolean;
  /** `null` when the save has no date count to state: the label is "Save". */
  readonly reach: SaveReach | null;
  /**
   * The form has a problem the Manager can be taken to. Save then stays pressable: a press calls
   * `onRefused`, then `focusFirstProblem`, and never `onSave`.
   */
  readonly hasProblem: boolean;
  /**
   * Why Save is off, as text beside it. With no problem in the form to go to (a missing name, an
   * unanswered conflict), a reason disables Save outright.
   */
  readonly blockedReason: string | null;
  /** Shown while dirty and `count` is above 0. */
  readonly specialHours?: SpecialHoursChoice | null;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  /** A press was refused for a problem: reveal every problem (the press validates the whole form). */
  readonly onRefused?: () => void;
  /** Moves focus to the first problem. Called after the refused press has rendered. */
  readonly focusFirstProblem: () => void;
}

function useSaveLabel(reach: SaveReach | null) {
  const { t } = useTranslation();
  if (reach === null) return t("availabilitySchedules.save");
  if (reach.kind === "from") return t("availabilityHub.saveBar.saveFrom", { date: reach.date });
  return t("availabilityHub.saveBar.saveForDates", { count: reach.count });
}

function SpecialHours(props: SpecialHoursChoice) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className={styles.choice}>
      <Text variant="body" color="primary" id={labelId}>
        {t("availabilityHub.saveBar.specialHours", { count: props.count })}
      </Text>
      <SegmentedControl
        aria-labelledby={labelId}
        segments={[
          { id: "keep", label: t("availabilitySchedules.keepTheirs") },
          { id: "replace", label: t("availabilitySchedules.replaceThem") },
        ]}
        value={props.value}
        onChange={(mode) => props.onChange(mode as ScopeConflictMode)}
      />
    </div>
  );
}

/**
 * The Discard and Save bar every hours editor ends with (availability-hub PRD 8). It holds no
 * draft: the editor says whether it is dirty, what the save reaches and what blocks it. The bar
 * owns only the refused press: Save with a problem takes the Manager to the first one.
 */
export function EditorSaveBar(props: EditorSaveBarProps) {
  const { dirty, saving = false, hasProblem, blockedReason, specialHours, onSave } = props;
  const { t } = useTranslation();
  const blockedId = useId();
  const label = useSaveLabel(props.reach);
  // Counts refused presses, so each one moves focus once its problems have rendered.
  const [refusals, setRefusals] = useState(0);
  const focusProblem = useEffectEvent(props.focusFirstProblem);
  useEffect(() => {
    if (refusals > 0) focusProblem();
  }, [refusals]);

  const refused = dirty && hasProblem;
  const press = () => {
    if (!refused) return onSave();
    props.onRefused?.();
    setRefusals((n) => n + 1);
  };
  const reason = dirty ? blockedReason : null;

  return (
    <div className={styles.bar} data-testid="editor-save-bar" data-pinned={dirty ? "" : undefined}>
      {dirty && specialHours && specialHours.count > 0 && <SpecialHours {...specialHours} />}
      <div className={styles.footer}>
        <BlockedReason id={blockedId} reason={reason} />
        <div className={styles.actions}>
          {dirty && (
            <Button variant="secondary" disabled={saving} onClick={props.onDiscard}>
              {t("availabilitySchedules.layer.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            // A Save refused for a problem in the form stays pressable (aria-disabled, not
            // disabled): pressing it says the problem and takes the Manager to it.
            disabled={!dirty || (reason !== null && !refused)}
            aria-disabled={refused || undefined}
            className={refused ? styles.refused : undefined}
            aria-describedby={reason !== null ? blockedId : undefined}
            isLoading={saving}
            onClick={press}
          >
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}

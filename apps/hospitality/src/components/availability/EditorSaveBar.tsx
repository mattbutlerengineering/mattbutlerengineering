import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, SegmentedControl, Text } from "@mattbutlerengineering/rialto";
import type { ScopeConflictMode } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
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
  /** `null`, or a count that is not a whole number above 0: the label is "Save". */
  readonly reach: SaveReach | null;
  /**
   * The form has a problem the Manager can be taken to. A press then calls `onRefused` and never
   * `onSave`. With no `blockedReason`, the bar says "Fix the problems above to save."
   */
  readonly hasProblem: boolean;
  /**
   * Why Save is off, as text beside it. With no problem in the form to go to (a missing name, an
   * unanswered conflict), a press does nothing.
   */
  readonly blockedReason: string | null;
  /** Shown while dirty and `count` is a whole number above 0. */
  readonly specialHours?: SpecialHoursChoice | null;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  /** A press was refused for a problem: `refuse` from the editor's `useRefusedPress`. */
  readonly onRefused: () => void;
  /** The editor's own choice (seasonal hours' overlap), kept in view above the buttons. */
  readonly children?: ReactNode;
}

/** A count worth saying: 0, a fraction or a missing number says nothing. */
const countable = (count: number) => Number.isInteger(count) && count > 0;

function useCountText() {
  const { locale } = useVenueFormat();
  return (count: number) => new Intl.NumberFormat(locale).format(count);
}

function useSaveLabel(reach: SaveReach | null) {
  const { t } = useTranslation();
  const countText = useCountText();
  if (reach?.kind === "from") return t("availabilityHub.saveBar.saveFrom", { date: reach.date });
  if (reach === null || !countable(reach.count)) return t("availabilitySchedules.save");
  const { count } = reach;
  return t("availabilityHub.saveBar.saveForDates", { count, dates: countText(count) });
}

function SpecialHours(props: SpecialHoursChoice) {
  const { count } = props;
  const { t } = useTranslation();
  const countText = useCountText();
  const labelId = useId();
  return (
    <div className={styles.choice}>
      <Text variant="body" color="primary" id={labelId}>
        {t("availabilityHub.saveBar.specialHours", { count, dates: countText(count) })}
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
 * state and no draft: the editor says whether it is dirty, what the save reaches and what blocks
 * it, and owns the refusal (`useRefusedPress`) that takes the Manager to the first problem.
 */
export function EditorSaveBar(props: EditorSaveBarProps) {
  const { dirty, saving = false, hasProblem, specialHours } = props;
  const { t } = useTranslation();
  const reasonId = useId();
  const label = useSaveLabel(props.reach);
  const refused = dirty && hasProblem;
  const reason = !dirty
    ? null
    : (props.blockedReason ?? (hasProblem ? t("availabilityHub.saveBar.fixProblems") : null));
  // Off, and still in the Tab order: a disabled button could not be reached to hear why.
  const off = reason !== null;
  const press = () => {
    if (refused) props.onRefused();
    else if (!off) props.onSave();
  };

  return (
    <div className={styles.bar} data-testid="editor-save-bar" data-pinned={dirty ? "" : undefined}>
      {props.children}
      {dirty && specialHours && countable(specialHours.count) && <SpecialHours {...specialHours} />}
      <div className={styles.footer}>
        {/* Always there, so a reason that appears is announced. */}
        <div role="status" id={reasonId} className={styles.reason}>
          {reason !== null && (
            <Text variant="caption" color="secondary">
              {reason}
            </Text>
          )}
        </div>
        <div className={styles.actions}>
          {dirty && (
            <Button variant="secondary" disabled={saving} onClick={props.onDiscard}>
              {t("availabilitySchedules.layer.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty}
            aria-disabled={off || undefined}
            className={off ? styles.off : undefined}
            aria-describedby={off ? reasonId : undefined}
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

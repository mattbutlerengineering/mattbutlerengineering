import { useTranslation } from "react-i18next";
import { Button, IconButton } from "@mattbutlerengineering/rialto";
import styles from "./AvailabilitySelectionBar.module.css";

export interface AvailabilitySelectionBarProps {
  readonly selection: readonly string[];
  /** Only Managers change hours (F-HOST); everyone else can still look and clear. */
  readonly canEdit: boolean;
  /** Open the day drawer with these dates as its fixed scope. */
  readonly onEditHours: (dates: readonly string[]) => void;
  readonly onClear: () => void;
  /** Open the Use schedule / another day's hours dialog. */
  readonly onUseSchedule?: () => void;
  /** Two or more schedules exist, so the action names a schedule rather than another day. */
  readonly multipleSchedules?: boolean;
  /** Open the Clear changes confirmation. */
  readonly onClearChanges?: () => void;
  /** At least one selected date has an hours change of its own to clear. */
  readonly canClearChanges?: boolean;
  /** Select days is on: the bar shows even before a day is picked, with the way out. */
  readonly selecting?: boolean;
}

/**
 * The bar that appears while days are picked (ux.md F-MS). Its live region stays mounted even
 * when nothing is picked, so the first selection is announced rather than silently inserted.
 * Close… joins it with its own slice.
 */
export function AvailabilitySelectionBar(props: AvailabilitySelectionBarProps) {
  const { selection, canEdit, onEditHours, onClear, onUseSchedule, onClearChanges } = props;
  const { t } = useTranslation();
  const count = selection.length;
  const showing = count > 0 || props.selecting;
  const picking = canEdit && count > 0;

  return (
    <div className={showing ? styles.bar : undefined}>
      <div role="status" aria-live="polite" className={styles.count}>
        {count > 0
          ? t("availability.selection.count", { count })
          : props.selecting
            ? t("availability.selection.selectingHint")
            : null}
      </div>
      {showing && (
        <div
          role="group"
          aria-label={t("availability.selection.barLabel")}
          className={styles.actions}
        >
          {picking && (
            <Button variant="primary" onClick={() => onEditHours(selection)}>
              {t("availability.selection.editHours")}
            </Button>
          )}
          {picking && onUseSchedule && (
            <Button variant="secondary" onClick={onUseSchedule}>
              {t(
                props.multipleSchedules
                  ? "availability.selection.useSchedule"
                  : "availability.selection.useOtherDay"
              )}
            </Button>
          )}
          {picking && onClearChanges && (
            <Button variant="secondary" disabled={!props.canClearChanges} onClick={onClearChanges}>
              {t("availability.selection.clearChanges")}
            </Button>
          )}
          <IconButton
            aria-label={t("availability.selection.clear")}
            icon={<span aria-hidden="true">✕</span>}
            onClick={onClear}
          />
        </div>
      )}
    </div>
  );
}

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
}

/**
 * The bar that appears while days are picked (ux.md F-MS). Its live region stays mounted even
 * when nothing is picked, so the first selection is announced rather than silently inserted.
 * Close…, Use schedule and Clear changes join it with their own slices.
 */
export function AvailabilitySelectionBar(props: AvailabilitySelectionBarProps) {
  const { selection, canEdit, onEditHours, onClear } = props;
  const { t } = useTranslation();
  const count = selection.length;

  return (
    <div className={count > 0 ? styles.bar : undefined}>
      <div role="status" aria-live="polite" className={styles.count}>
        {count > 0 ? t("availability.selection.count", { count }) : null}
      </div>
      {count > 0 && (
        <div
          role="group"
          aria-label={t("availability.selection.barLabel")}
          className={styles.actions}
        >
          {canEdit && (
            <Button variant="primary" onClick={() => onEditHours(selection)}>
              {t("availability.selection.editHours")}
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

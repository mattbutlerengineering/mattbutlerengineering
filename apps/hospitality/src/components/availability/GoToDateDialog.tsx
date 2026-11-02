import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Dialog } from "@mattbutlerengineering/rialto";
import styles from "./ScheduleFormParts.module.css";

export interface GoToDateDialogProps {
  readonly open: boolean;
  /** The date the picker starts on (the calendar's current anchor). */
  readonly initial: string;
  /** A venue calendar date (`yyyy-mm-dd`); the caller moves the calendar there. */
  readonly onGo: (date: string) => void;
  readonly onClose: () => void;
}

/** Go to date (ux.md S2 overflow): jump the calendar to any date, past or future. */
export function GoToDateDialog(props: GoToDateDialogProps) {
  const { open, initial, onGo, onClose } = props;
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  // Reopening starts from where the calendar is now, not from the last jump.
  const value = open ? (chosen ?? initial) : null;

  const close = () => {
    setChosen(null);
    onClose();
  };
  const go = () => {
    if (!value) return;
    onGo(value);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("availability.toolbar.goToDate")}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={close}>
            {t("availability.toolbar.goToDateCancel")}
          </Button>
          <Button variant="primary" disabled={!value} onClick={go}>
            {t("availability.toolbar.goToDateSubmit")}
          </Button>
        </div>
      }
    >
      <DatePicker
        label={t("availability.toolbar.goToDateLabel")}
        value={value}
        onChange={setChosen}
      />
    </Dialog>
  );
}

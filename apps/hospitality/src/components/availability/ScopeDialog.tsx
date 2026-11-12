import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Radio, RadioGroup } from "@mattbutlerengineering/rialto";
import type { SeriesScope } from "./series-edit.js";
import styles from "./CloseDialog.module.css";

/** Which dates of a rule an edit reaches: the one date, it and every later one, or all of them. */
export type Scope = "only" | SeriesScope;

export interface ScopeChoiceProps {
  /** The radio group's name. */
  readonly name: string;
  readonly value: Scope;
  readonly onChange: (scope: Scope) => void;
  /** The date "Only" and "This and following" start from, formatted. */
  readonly dateLabel: string;
  /** The scopes on offer; "only" first. */
  readonly offer?: readonly Scope[];
}

/**
 * The words for "only this date / this and following / all dates": the one set every scope
 * question in Availability uses (special hours, a dated schedule, a repeating closure).
 */
export function ScopeChoice(props: ScopeChoiceProps) {
  const { name, value, onChange, dateLabel, offer = ["only", "following", "all"] } = props;
  const { t } = useTranslation();
  return (
    <RadioGroup
      label={t("availabilitySpecial.scope.label")}
      name={name}
      value={value}
      onChange={(next) => onChange(next as Scope)}
    >
      {offer.map((scope) => (
        <Radio
          key={scope}
          value={scope}
          label={t(`availabilitySpecial.scope.${scope}`, { date: dateLabel })}
        />
      ))}
    </RadioGroup>
  );
}

export interface ScopeDialogProps {
  readonly title: string;
  readonly name: string;
  readonly dateLabel: string;
  readonly offer?: readonly Scope[];
  /** The scope the question opens on; defaults to the first offered. */
  readonly initial?: Scope;
  /** Fields above the choice (a date picker), told the scope picked so far. */
  readonly before?: (scope: Scope) => ReactNode;
  /** Continue was pressed with this scope. */
  readonly onContinue: (scope: Scope) => void;
  readonly onClose: () => void;
}

/** The one scope question: Cancel and Continue under the shared choice. */
export function ScopeDialog(props: ScopeDialogProps) {
  const { title, name, dateLabel, offer, initial, before, onContinue, onClose } = props;
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>(initial ?? offer?.[0] ?? "only");
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySpecial.series.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onContinue(scope)}>
            {t("availabilitySpecial.scope.continue")}
          </Button>
        </div>
      }
    >
      {before?.(scope)}
      <ScopeChoice
        name={name}
        value={scope}
        onChange={setScope}
        dateLabel={dateLabel}
        offer={offer}
      />
    </Dialog>
  );
}

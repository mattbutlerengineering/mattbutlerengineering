import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack } from "@mattbutlerengineering/rialto";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { focusFirstInvalid } from "./quick-setup-field-helpers.js";
import { emptyDraft, type QuickSetupDraft } from "./quick-setup-draft.js";
import { validateDraft } from "./quick-setup-validate.js";
import styles from "./QuickSetupCard.module.css";

export interface QuickSetupCardProps {
  /** Resolves once saved; rejects are the owner's to describe through `errorMessage`. */
  readonly onSave: (draft: QuickSetupDraft) => Promise<void>;
  /** The server's failure, shown in an `Alert` that takes focus. Values stay as typed. */
  readonly errorMessage: string | null;
  /** Called as the draft moves away from, or back to, the blank form it started as. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * S1 "Set your regular week": the form plus its Save. Invalid input sends nothing and moves
 * focus to the first invalid field; a server error keeps the values and offers a retry.
 */
export function QuickSetupCard({ onSave, errorMessage, onDirtyChange }: QuickSetupCardProps) {
  const { t } = useTranslation();
  const [blank] = useState(() => JSON.stringify(emptyDraft(crypto.randomUUID())));
  const [draft, setDraft] = useState<QuickSetupDraft>(() => JSON.parse(blank) as QuickSetupDraft);
  const edit = (next: QuickSetupDraft) => {
    setDraft(next);
    onDirtyChange?.(JSON.stringify(next) !== blank);
  };
  const scopeId = useId();
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorMessage !== null) errorRef.current?.focus();
  }, [errorMessage]);

  const issues = attempted ? validateDraft(draft) : [];

  const save = async () => {
    const found = validateDraft(draft);
    setAttempted(true);
    if (found.length > 0) {
      focusFirstInvalid(found, scopeId);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      title={t("availability.quickSetup.title")}
      subtitle={t("availability.quickSetup.intro")}
      headingLevel={2}
    >
      <Stack gap="md">
        {errorMessage !== null && (
          <div ref={errorRef} tabIndex={-1} className={styles.errorSlot}>
            <Alert variant="error" title={t("availability.quickSetup.saveErrorTitle")}>
              {errorMessage}
            </Alert>
          </div>
        )}
        <QuickSetupForm draft={draft} onChange={edit} issues={issues} idScope={scopeId} />
        <Stack direction="row" justify="end">
          <Button variant="primary" onClick={save} disabled={isSaving}>
            {isSaving
              ? t("availability.quickSetup.saving")
              : errorMessage !== null
                ? t("availability.quickSetup.retry")
                : t("availability.quickSetup.save")}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

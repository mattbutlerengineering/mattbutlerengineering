import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack } from "@mattbutlerengineering/rialto";
import { QuickSetupForm, quickSetupFieldId } from "./QuickSetupForm.js";
import { emptyDraft, validateDraft, type QuickSetupDraft } from "./quick-setup-draft.js";
import styles from "./QuickSetupCard.module.css";

export interface QuickSetupCardProps {
  /** Resolves once saved; rejects are the owner's to describe through `errorMessage`. */
  readonly onSave: (draft: QuickSetupDraft) => Promise<void>;
  /** The server's failure, shown in an `Alert` that takes focus. Values stay as typed. */
  readonly errorMessage: string | null;
}

/**
 * S1 "Set your regular week": the form plus its Save. Invalid input sends nothing and moves
 * focus to the first invalid field; a server error keeps the values and offers a retry.
 */
export function QuickSetupCard({ onSave, errorMessage }: QuickSetupCardProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<QuickSetupDraft>(() => emptyDraft(crypto.randomUUID()));
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
    const first = found[0];
    if (first) {
      document.getElementById(quickSetupFieldId(first.serviceId, first.field))?.focus();
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
    <Card title={t("availability.quickSetup.title")} subtitle={t("availability.quickSetup.intro")}>
      <Stack gap="md">
        {errorMessage !== null && (
          <div ref={errorRef} tabIndex={-1} className={styles.errorSlot}>
            <Alert variant="error" title={t("availability.quickSetup.saveErrorTitle")}>
              {errorMessage}
            </Alert>
          </div>
        )}
        <QuickSetupForm draft={draft} onChange={setDraft} issues={issues} />
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

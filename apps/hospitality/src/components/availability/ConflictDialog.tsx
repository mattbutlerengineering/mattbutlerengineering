import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Heading, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import type { DraftService } from "./draft-changes.js";
import styles from "./ConflictDialog.module.css";

export interface ConflictDialogProps {
  readonly open: boolean;
  /** The change that won; `null` when the server recorded none. */
  readonly winningChange: AvailabilityChangeSummary | null;
  readonly services: readonly DraftService[];
  readonly isSaving: boolean;
  readonly onOverwrite: () => void;
  readonly onDiscard: () => void;
}

/**
 * "Someone changed availability first" (ux.md F2 step 5): Review their change, Overwrite with
 * the draft, or Discard it. Review shows their change and the draft side by side.
 */
export function ConflictDialog(props: ConflictDialogProps) {
  const { open, winningChange, services, isSaving, onOverwrite, onDiscard } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [reviewing, setReviewing] = useState(false);

  const time = winningChange
    ? format.formatInstant(winningChange.at, { hour: "numeric", minute: "2-digit" })
    : "";
  const theirs = winningChange
    ? t("availability.editor.conflict.theirs", { summary: winningChange.summary, time })
    : t("availability.editor.conflict.theirsUnknown");

  return (
    <Dialog
      open={open}
      // Escape or a backdrop click is not an answer; the Manager picks one of the three.
      onClose={() => undefined}
      title={t("availability.editor.conflict.title")}
      footer={
        <div className={styles.footer}>
          {!reviewing && (
            <Button variant="secondary" onClick={() => setReviewing(true)}>
              {t("availability.editor.conflict.review")}
            </Button>
          )}
          <Button variant="secondary" onClick={onDiscard} disabled={isSaving}>
            {t("availability.editor.conflict.discard")}
          </Button>
          <Button variant="primary" onClick={onOverwrite} isLoading={isSaving}>
            {t("availability.editor.conflict.overwrite")}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <Text variant="body" color="primary">
          {theirs}
        </Text>
        {reviewing && (
          <div className={styles.columns}>
            <section aria-labelledby="conflict-theirs">
              <Heading level={3} size={4} id="conflict-theirs">
                {t("availability.editor.conflict.theirsHeading")}
              </Heading>
              <Text variant="body" color="secondary">
                {winningChange?.summary ?? t("availability.editor.conflict.theirsUnknown")}
              </Text>
            </section>
            <section aria-labelledby="conflict-yours">
              <Heading level={3} size={4} id="conflict-yours">
                {t("availability.editor.conflict.yoursHeading")}
              </Heading>
              <ul className={styles.list}>
                {services.map((s) => (
                  <li key={s.key}>
                    <Text as="span" variant="body" color="secondary">
                      {t("availability.editor.conflict.yourService", {
                        name: s.name,
                        from: minuteText(s.opensAt, t, format),
                        to: minuteText(s.closesAt, t, format),
                      })}
                    </Text>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Stack>
    </Dialog>
  );
}

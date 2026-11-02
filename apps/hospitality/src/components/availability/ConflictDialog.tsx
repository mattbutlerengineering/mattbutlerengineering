import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Heading, Stack, Text } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityChangeSummary,
  ConflictChangesSince,
  StrandedReservation,
} from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import type { DraftService } from "./draft-changes.js";
import { StrandedBookings } from "./StrandedBookings.js";
import styles from "./ConflictDialog.module.css";

export interface ConflictDialogProps {
  readonly open: boolean;
  /** The change that won; `null` when the server recorded none. */
  readonly winningChange: AvailabilityChangeSummary | null;
  /** Every change since the draft's version (the newest few and the true count); absent from an older server. */
  readonly changesSince?: ConflictChangesSince;
  readonly services: readonly DraftService[];
  readonly isSaving: boolean;
  /** Why the last Overwrite was refused; shown here because the page behind the modal is not. */
  readonly failure?: readonly string[];
  /** The bookings behind a stranded refusal of that Overwrite. */
  readonly stranded?: readonly StrandedReservation[];
  /** The 409 named the version Overwrite goes against; without it Overwrite is not offered. */
  readonly ready: boolean;
  /** Overwrite found a newer change; the dialog now shows that one. */
  readonly changedAgain: boolean;
  readonly onOverwrite: () => void;
  readonly onDiscard: () => void;
  /** Close the dialog and return to the draft, edits intact. */
  readonly onBack: () => void;
}

/**
 * "Someone changed availability first" (ux.md F2 step 5): Review their change, Overwrite with
 * the draft, or Discard it. Review shows their change and the draft side by side.
 */
export function ConflictDialog(props: ConflictDialogProps) {
  const { open, winningChange, services, isSaving, failure = [], onOverwrite, onDiscard } = props;
  const { ready, changedAgain, onBack } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [reviewing, setReviewing] = useState(false);

  // An older server sends no `changesSince`: the winning change alone is named, as before.
  const listed = props.changesSince?.changes ?? [];
  const unlisted = props.changesSince ? Math.max(props.changesSince.total - listed.length, 0) : 0;

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
          <Button variant="secondary" onClick={onBack} disabled={isSaving}>
            {t("availability.editor.conflict.back")}
          </Button>
          <Button variant="secondary" onClick={onDiscard} disabled={isSaving}>
            {t("availability.editor.conflict.discard")}
          </Button>
          <Button variant="primary" onClick={onOverwrite} isLoading={isSaving} disabled={!ready}>
            {t("availability.editor.conflict.overwrite")}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        {failure.length > 0 && (
          <Alert variant="error" title={t("availability.editor.saveError")}>
            {failure.map((message) => (
              <Text key={message} variant="body" color="primary">
                {message}
              </Text>
            ))}
          </Alert>
        )}
        {/* Outside the alert, which would read every row aloud. */}
        {failure.length > 0 && <StrandedBookings reservations={props.stranded ?? []} />}
        {changedAgain && (
          <Text variant="body" color="primary">
            {t("availability.editor.conflict.again")}
          </Text>
        )}
        {listed.length > 1 ? (
          <Stack gap="sm">
            <Text variant="body" color="primary">
              {t("availability.editor.conflict.since")}
            </Text>
            <ul className={styles.list}>
              {listed.map((change) => (
                <li key={change.id}>
                  <Text as="span" variant="body" color="primary">
                    {t("availability.editor.conflict.theirs", {
                      summary: change.summary,
                      time: format.formatInstant(change.at, { hour: "numeric", minute: "2-digit" }),
                    })}
                  </Text>
                </li>
              ))}
            </ul>
          </Stack>
        ) : (
          <Text variant="body" color="primary">
            {theirs}
          </Text>
        )}
        {unlisted > 0 && (
          <Text variant="body" color="primary">
            {t("availability.editor.conflict.earlier", { count: unlisted })}
          </Text>
        )}
        {!ready && (
          <Text variant="caption" color="secondary" role="status">
            {t("availability.editor.conflict.unavailable")}
          </Text>
        )}
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

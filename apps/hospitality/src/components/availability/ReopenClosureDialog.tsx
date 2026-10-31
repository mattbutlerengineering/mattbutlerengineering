import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Alert, Button, Checkbox, Dialog, Text, useToast } from "@mattbutlerengineering/rialto";
import { AvailabilityConfigProblemSchema } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { describeApiError } from "../../lib/describe-api-error.js";

export interface ReopenClosureDialogProps {
  readonly venueId: string;
  readonly ruleId: string;
  /** What is reopened, named whole: "Thu, Dec 24", "Thu, Dec 24 to Tue, Jan 5", "every Monday (…)". */
  readonly subject: string;
  /**
   * Bookings the closure cancelled; the opt-in notice goes to these guests. `null` when the
   * count could not be read: Reopen waits for it, because the notice is not undoable.
   */
  readonly cancelled: number | null;
  /** Of those, the guests whose booking has not started: the only ones a notice can reach. */
  readonly notifiable?: number | null;
  /** The count is unknown because reading it failed, not because it is still loading. */
  readonly countFailed?: boolean;
  /** Asks again for the count; shown with the notice that it is unknown. */
  readonly onRetryCount: () => void;
  /** Skips and one-date edits of a series; reopening the series removes them too. */
  readonly editedDates?: number;
  /** This closure is one date of a repeating closure that stays: removing it hands the date back. */
  readonly isSeriesEdit?: boolean;
  /** The subject covers many dates (a range, an open end or a repeat), not one. */
  readonly subjectIsSpan?: boolean;
  readonly onClose: () => void;
}

/** The count of bookings a refused reopen would leave without service, or `null` for any other refusal. */
function strandedCount(error: unknown): number | null {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  if (!problem.success || problem.data.code !== "invalid-config") return null;
  const stranded = problem.data.issues?.filter((i) => i.code === "strands_booking") ?? [];
  return stranded.length > 0 ? stranded.length : null;
}

function failureText(error: unknown, t: TFunction): string {
  const count = strandedCount(error);
  return count === null
    ? describeApiError(error).detail
    : t("availabilitySpecial.reopen.stranded", { count });
}

/** A span has no singular article to agree with ("el todas las fechas…"), so it gets its own title. */
function titleKey(props: ReopenClosureDialogProps): "titleSeriesEdit" | "titleSpan" | "title" {
  if (props.isSeriesEdit) return "titleSeriesEdit";
  return props.subjectIsSpan ? "titleSpan" : "title";
}

function doneKey(props: ReopenClosureDialogProps): "doneSeriesEdit" | "doneSpan" | "done" {
  if (props.isSeriesEdit) return "doneSeriesEdit";
  return props.subjectIsSpan ? "doneSpan" : "done";
}

function descriptionKey(
  props: ReopenClosureDialogProps
):
  | "availabilitySpecial.reopen.descriptionSeriesEdit"
  | "availabilitySpecial.reopen.descriptionCancelled"
  | "availabilitySpecial.reopen.description" {
  if (props.isSeriesEdit) return "availabilitySpecial.reopen.descriptionSeriesEdit";
  return (props.cancelled ?? 0) > 0
    ? "availabilitySpecial.reopen.descriptionCancelled"
    : "availabilitySpecial.reopen.description";
}

/**
 * Reopen a closure (ux.md F6 step 2). The guests it cancelled stay cancelled; the checkbox,
 * on by default, sends them the opt-in "we've reopened, rebook" notice.
 */
export function ReopenClosureDialog(props: ReopenClosureDialogProps) {
  const { venueId, ruleId, subject, cancelled, editedDates = 0, isSeriesEdit, onClose } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useReopenClosure();
  // The guests a notice can still reach: their booking has not started. An older API does not
  // say, so every cancelled guest counts.
  const reachable = props.notifiable ?? cancelled ?? 0;
  const [tell, setTell] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const reopen = async () => {
    if (cancelled === null) return;
    setFailure(null);
    try {
      // A date handed back to the series stays closed: its guests are never told to rebook.
      const told = !isSeriesEdit && reachable > 0 && tell;
      const saved = await mutateAsync({ venueId, ruleId, tellCancelledGuests: told });
      const title = t(`availabilitySpecial.reopen.${doneKey(props)}`, { date: subject });
      // A reopen that told guests cannot be reverted (ux.md F6 step 3); one that told none can.
      // The server says how many it reached; an older one does not, and `told` stands in.
      const toldGuests = saved.notified == null ? told : saved.notified > 0;
      if (toldGuests) toast({ title, variant: "success" });
      else offerUndo({ venueId, title, saved });
      onClose();
    } catch (error) {
      setFailure(failureText(error, t));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`availabilitySpecial.reopen.${titleKey(props)}`, { date: subject })}
      description={t(descriptionKey(props))}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t(
              isSeriesEdit
                ? "availabilitySpecial.reopen.keepSeriesEdit"
                : "availabilitySpecial.reopen.keep"
            )}
          </Button>
          <Button
            variant="primary"
            onClick={() => void reopen()}
            isLoading={isPending}
            disabled={cancelled === null}
          >
            {t(
              isSeriesEdit
                ? "availabilitySpecial.reopen.confirmSeriesEdit"
                : "availabilitySpecial.reopen.confirm"
            )}
          </Button>
        </>
      }
    >
      {failure && <Alert variant="error">{failure}</Alert>}
      {cancelled === null && !props.countFailed && (
        <Text>{t("availabilitySpecial.reopen.countLoading")}</Text>
      )}
      {cancelled === null && props.countFailed && (
        <Alert variant="error">
          <Text>{t("availabilitySpecial.reopen.countUnknown")}</Text>
          <Button variant="secondary" onClick={props.onRetryCount}>
            {t("availabilitySpecial.reopen.retryCount")}
          </Button>
        </Alert>
      )}
      {editedDates > 0 && (
        <Text>{t("availabilitySpecial.reopen.editedDates", { count: editedDates })}</Text>
      )}
      {!isSeriesEdit && reachable > 0 && (
        <Checkbox
          label={t("availabilitySpecial.reopen.tell", { count: reachable })}
          checked={tell}
          onCheckedChange={setTell}
        />
      )}
    </Dialog>
  );
}

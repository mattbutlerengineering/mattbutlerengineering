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
  /** Asks again for the count; shown with the notice that it is unknown. */
  readonly onRetryCount: () => void;
  /** Skips and one-date edits of a series; reopening the series removes them too. */
  readonly editedDates?: number;
  /** This closure is one date of a repeating closure that stays: removing it hands the date back. */
  readonly isSeriesEdit?: boolean;
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
  const { venueId, ruleId, subject, cancelled, editedDates = 0, onClose } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useReopenClosure();
  const [tell, setTell] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const reopen = async () => {
    if (cancelled === null) return;
    setFailure(null);
    try {
      const told = cancelled > 0 && tell;
      const saved = await mutateAsync({ venueId, ruleId, tellCancelledGuests: told });
      const title = t("availabilitySpecial.reopen.done", { date: subject });
      // A reopen that told guests cannot be reverted (ux.md F6 step 3); one that told none can.
      if (told) toast({ title, variant: "success" });
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
      title={t("availabilitySpecial.reopen.title", { date: subject })}
      description={t(descriptionKey(props))}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySpecial.reopen.keep")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void reopen()}
            isLoading={isPending}
            disabled={cancelled === null}
          >
            {t("availabilitySpecial.reopen.confirm")}
          </Button>
        </>
      }
    >
      {failure && <Alert variant="error">{failure}</Alert>}
      {cancelled === null && (
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
      {cancelled !== null && cancelled > 0 && (
        <Checkbox
          label={t("availabilitySpecial.reopen.tell", { count: cancelled })}
          checked={tell}
          onCheckedChange={setTell}
        />
      )}
    </Dialog>
  );
}

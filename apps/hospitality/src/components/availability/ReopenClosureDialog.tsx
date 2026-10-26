import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Checkbox, Dialog, useToast } from "@mattbutlerengineering/rialto";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { describeApiError } from "../../lib/describe-api-error.js";

export interface ReopenClosureDialogProps {
  readonly venueId: string;
  readonly ruleId: string;
  /** "Thu, Dec 24", already formatted. */
  readonly dateLabel: string;
  /** Bookings the closure cancelled; the opt-in notice goes to these guests. */
  readonly cancelled: number;
  readonly onClose: () => void;
}

/**
 * Reopen a closure (ux.md F6 step 2). The guests it cancelled stay cancelled; the checkbox,
 * on by default, sends them the opt-in "we've reopened, rebook" notice.
 */
export function ReopenClosureDialog(props: ReopenClosureDialogProps) {
  const { venueId, ruleId, dateLabel, cancelled, onClose } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useReopenClosure();
  const [tell, setTell] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  const reopen = async () => {
    setFailure(null);
    try {
      const told = cancelled > 0 && tell;
      const saved = await mutateAsync({ venueId, ruleId, tellCancelledGuests: told });
      const title = t("availabilitySpecial.reopen.done", { date: dateLabel });
      // A reopen that told guests cannot be reverted (ux.md F6 step 3); one that told none can.
      if (told) toast({ title, variant: "success" });
      else offerUndo({ venueId, title, saved });
      onClose();
    } catch (error) {
      setFailure(describeApiError(error).detail);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("availabilitySpecial.reopen.title", { date: dateLabel })}
      description={t(
        cancelled > 0
          ? "availabilitySpecial.reopen.descriptionCancelled"
          : "availabilitySpecial.reopen.description"
      )}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySpecial.reopen.keep")}
          </Button>
          <Button variant="primary" onClick={() => void reopen()} isLoading={isPending}>
            {t("availabilitySpecial.reopen.confirm")}
          </Button>
        </>
      }
    >
      {failure && <Alert variant="error">{failure}</Alert>}
      {cancelled > 0 && (
        <Checkbox
          label={t("availabilitySpecial.reopen.tell", { count: cancelled })}
          checked={tell}
          onCheckedChange={setTell}
        />
      )}
    </Dialog>
  );
}

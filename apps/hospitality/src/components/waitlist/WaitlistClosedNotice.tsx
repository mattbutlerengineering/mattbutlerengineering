import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button, Card, Stack, Text, useToast } from "@mattbutlerengineering/rialto";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { describeApiError } from "../../lib/describe-api-error.js";

export interface WaitlistClosedNoticeProps {
  readonly venueId: string;
  /** The staff note on the closure, if it carries one. */
  readonly note: string | null;
  /** The closure that closed the waitlist; without it there is nothing to reopen. */
  readonly ruleId: string | null;
  /** Show Reopen waitlist: a Manager, and a closure that covers only the waitlist and tonight. */
  readonly canReopen: boolean;
  /** Reopen would delete more than tonight's waitlist closure, so point a Manager to Special dates. */
  readonly manageInAvailability: boolean;
}

/**
 * Takes the place of the waitlist's Add form while the waitlist is closed (ux.md F8):
 * "Waitlist closed tonight: <note>", with Reopen waitlist for a Manager when reopening is safe.
 */
export function WaitlistClosedNotice({
  venueId,
  note,
  ruleId,
  canReopen,
  manageInAvailability,
}: WaitlistClosedNoticeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutateAsync, isPending } = useReopenClosure();

  const reopen = async () => {
    if (!ruleId) return;
    try {
      await mutateAsync({ venueId, ruleId, tellCancelledGuests: false });
      toast({ title: t("waitlist.closed.reopened"), variant: "success" });
    } catch (error) {
      toast({
        title: t("waitlist.closed.reopenError"),
        description: describeApiError(error).detail,
        variant: "error",
      });
    }
  };

  return (
    <Card data-testid="waitlist-closed">
      <Stack gap="sm">
        <Text variant="body" color="primary">
          {note ? t("waitlist.closed.withNote", { note }) : t("waitlist.closed.message")}
        </Text>
        {canReopen && ruleId && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void reopen()}
            isLoading={isPending}
            loadingText={t("waitlist.closed.reopening")}
            style={{ alignSelf: "flex-start" }}
          >
            {t("waitlist.closed.reopen")}
          </Button>
        )}
        {manageInAvailability && <Link to="/availability">{t("waitlist.closed.manage")}</Link>}
      </Stack>
    </Card>
  );
}

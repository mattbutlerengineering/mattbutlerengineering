import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Button, Card, Stack, Text, useToast } from "@mattbutlerengineering/rialto";
import type { DateRule } from "@mbe/types";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { conflictOf } from "../availability/conflict-problem.js";
import { describeApiError } from "../../lib/describe-api-error.js";

export interface WaitlistClosedNoticeProps {
  readonly venueId: string;
  /** The staff note on the closure, if it carries one. */
  readonly note: string | null;
  /** The closure that closed the waitlist; without it there is nothing to reopen. */
  readonly rule: DateRule | null;
  /** Every date rule of the venue, to find the closure's skips and one-date edits. */
  readonly rules: readonly DateRule[];
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
  rule,
  rules,
  canReopen,
  manageInAvailability,
}: WaitlistClosedNoticeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutateAsync, isPending } = useReopenClosure();

  const refresh = useRefreshAvailability();

  const reopen = async () => {
    if (!rule) return;
    try {
      // What this screen read of the closure and its skips and edits: a teammate's change since
      // is refused by the server rather than deleted.
      const seen = { rule, children: rules.filter((r) => r.seriesId === rule.id) };
      await mutateAsync({ venueId, ruleId: rule.id, tellCancelledGuests: false, seen });
      toast({ title: t("waitlist.closed.reopened"), variant: "success" });
    } catch (error) {
      if (conflictOf(error)?.code === "version-conflict") {
        // This notice's copy of the closure is stale: show what is saved before the next Reopen.
        refresh();
        toast({ title: t("waitlist.closed.changed"), variant: "error" });
        return;
      }
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
        {canReopen && rule && (
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

import { useTranslation } from "react-i18next";
import { Banner, Button, useToast } from "@mattbutlerengineering/rialto";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { describeApiError } from "../../lib/describe-api-error.js";

export interface OnlinePausedBannerProps {
  readonly venueId: string;
  /** The open pause's rule id. */
  readonly ruleId: string;
  /** Only a Manager can resume; a Host sees the banner without the button. */
  readonly canResume: boolean;
}

/** "Online booking paused · Resume" above the calendar (ux.md F5 step 9). */
export function OnlinePausedBanner({ venueId, ruleId, canResume }: OnlinePausedBannerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { mutateAsync, isPending } = useReopenClosure();

  const resume = async () => {
    try {
      await mutateAsync({ venueId, ruleId, tellCancelledGuests: false });
      toast({ title: t("availability.paused.resumed"), variant: "success" });
    } catch (error) {
      toast({
        title: t("availability.paused.resumeError"),
        description: describeApiError(error).detail,
        variant: "error",
      });
    }
  };

  return (
    <Banner
      variant="warning"
      action={
        canResume ? (
          <Button variant="secondary" onClick={() => void resume()} isLoading={isPending}>
            {t("availability.paused.resume")}
          </Button>
        ) : undefined
      }
    >
      {t("availability.paused.banner")}
    </Banner>
  );
}

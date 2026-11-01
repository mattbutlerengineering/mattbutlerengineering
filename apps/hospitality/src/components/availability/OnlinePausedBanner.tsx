import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { conflictOf } from "./conflict-problem.js";

export interface OnlinePausedBannerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** The open pause. It may also pause phone or waitlist, which Resume leaves paused. */
  readonly rule: DateRule;
  /** Only a Manager can resume; a Host sees the banner without the button. */
  readonly canResume: boolean;
}

/** "Online booking paused · Resume" above the calendar (ux.md F5 step 9). */
export function OnlinePausedBanner({ venueId, state, rule, canResume }: OnlinePausedBannerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const reopen = useReopenClosure();
  const saveConfig = useSaveAvailabilityConfig();
  const refresh = useRefreshAvailability();
  const [resuming, setResuming] = useState(false);
  const others = (rule.bookingTypes ?? []).filter((channel) => channel !== "online");

  const resume = async () => {
    setResuming(true);
    try {
      if (others.length === 0) {
        await reopen.mutateAsync({ venueId, ruleId: rule.id, tellCancelledGuests: false });
      } else {
        // The pause also holds another channel: take online out of it and leave the rest paused.
        await saveConfig.mutateAsync({
          venueId,
          body: {
            expectedVersion: state.version,
            changes: { upsert: { dateRules: [{ ...rule, bookingTypes: others }] }, remove: {} },
            scopeConflicts: "keep",
          },
        });
      }
      toast({ title: t("availability.paused.resumed"), variant: "success" });
    } catch (error) {
      // A retry must not resend the version that just lost.
      if (conflictOf(error)?.code === "version-conflict") refresh();
      toast({
        title: t("availability.paused.resumeError"),
        description: describeApiError(error).detail,
        variant: "error",
      });
    } finally {
      setResuming(false);
    }
  };

  return (
    <Banner
      variant="warning"
      action={
        canResume ? (
          <Button variant="secondary" onClick={() => void resume()} isLoading={resuming}>
            {t("availability.paused.resume")}
          </Button>
        ) : undefined
      }
    >
      {t("availability.paused.banner")}
    </Banner>
  );
}

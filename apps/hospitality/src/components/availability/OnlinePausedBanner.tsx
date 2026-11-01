import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn, venueDate } from "../../utils/service-day.js";
import { isPauseInForce } from "./close-draft.js";
import { minuteText } from "./closure-band.js";
import { conflictOf } from "./conflict-problem.js";
import { onlineSeatingLeft } from "./online-seatings.js";

export interface OnlinePausedBannerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** The open pause. It may also pause phone or waitlist, which Resume leaves paused. */
  readonly rule: DateRule;
  /** Only a Manager can resume; a Host sees the banner without the button. */
  readonly canResume: boolean;
}

/**
 * "Online booking paused · Resume" above the calendar (ux.md F5 step 9). Before its start time a
 * pause says when it starts instead, and Resume, with nothing paused yet, reads as removing it.
 */
export function OnlinePausedBanner({ venueId, state, rule, canResume }: OnlinePausedBannerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const reopen = useReopenClosure();
  const saveConfig = useSaveAvailabilityConfig();
  const refresh = useRefreshAvailability();
  const [resuming, setResuming] = useState(false);
  const format = useVenueFormat();
  const now = useNow();
  const { timeZone } = format;
  const today = venueDate(now, timeZone);
  const minute = minutesOfDayIn(now, timeZone);
  const waitingFrom =
    rule.window && !isPauseInForce(rule, state.config, timeZone, today, minute)
      ? rule.window.from
      : null;
  const waiting = waitingFrom !== null;
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
      toast({
        title: t(waiting ? "availability.paused.removed" : "availability.paused.resumed"),
        variant: "success",
      });
    } catch (error) {
      // A retry must not resend the version that just lost.
      if (conflictOf(error)?.code === "version-conflict") refresh();
      toast({
        title: t(waiting ? "availability.paused.removeError" : "availability.paused.resumeError"),
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
            {t(waiting ? "availability.paused.remove" : "availability.paused.resume")}
          </Button>
        ) : undefined
      }
    >
      {waiting
        ? t(
            // A closed day or a day with no online service has no earlier seatings to promise.
            onlineSeatingLeft(state.config, timeZone, today, minute)
              ? "availability.paused.waiting"
              : "availability.paused.waitingNoneToday",
            { time: minuteText(waitingFrom, t, format) }
          )
        : t("availability.paused.banner")}
    </Banner>
  );
}

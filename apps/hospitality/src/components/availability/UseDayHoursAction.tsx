import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { waitingProps } from "./draft-wait.js";
import { UseScheduleDialog } from "./UseScheduleDialog.js";

export interface UseDayHoursActionProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly date: string;
  /** The change was saved; the drawer closes. */
  readonly onFinished: () => void;
  readonly onStale: () => void;
  /** An editor is open, or a reload is due: saving now would conflict with a save of ours. */
  readonly waiting?: boolean;
  /** The element that says why the action is waiting. */
  readonly reasonId?: string;
  /**
   * Why the date cannot take other hours (it is closed all day, so special hours written under
   * the closure would only surface if the closure were removed). Shown beside the button.
   */
  readonly closedReason?: string | null;
}

/**
 * "Use other hours…" in the day drawer (availability-hub ux.md:379, #8691): one name whether the
 * venue has one set of hours (pick a day) or several (pick a set). It is the selection bar's
 * dialog on one date, so the preview and the save are the same draft the bar builds, sent against
 * the version on hand.
 */
export function UseDayHoursAction(props: UseDayHoursActionProps) {
  const { venueId, state, timezone, date, onFinished, onStale, closedReason } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closedId = useId();
  const dates = useMemo(() => [date], [date]);
  const blocked = Boolean(closedReason);
  const waiting = blocked || (props.waiting ?? false);

  return (
    <>
      <Button
        variant="secondary"
        {...waitingProps(waiting, blocked ? closedId : props.reasonId)}
        onClick={() => {
          if (!waiting) setOpen(true);
        }}
      >
        {t("availabilityHub.dayActions.useOtherHours")}
      </Button>
      {closedReason && (
        <Text id={closedId} variant="caption" color="secondary">
          {closedReason}
        </Text>
      )}
      {open && (
        <UseScheduleDialog
          open
          venueId={venueId}
          state={state}
          timezone={timezone}
          dates={dates}
          onClose={() => setOpen(false)}
          onFinished={() => {
            setOpen(false);
            onFinished();
          }}
          onStale={onStale}
        />
      )}
    </>
  );
}

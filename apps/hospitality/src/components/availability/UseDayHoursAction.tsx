import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@mattbutlerengineering/rialto";
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
}

/**
 * "Use another day's hours…" in the day drawer (ux.md F2), "Use schedule…" once two schedules
 * exist. It is the selection bar's dialog on one date, so the preview and the save are the same
 * draft the bar builds, sent against the version on hand.
 */
export function UseDayHoursAction(props: UseDayHoursActionProps) {
  const { venueId, state, timezone, date, onFinished, onStale, waiting = false } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dates = useMemo(() => [date], [date]);
  const schedules = state.config.schedules.filter((s) => !s.archivedAt).length;

  return (
    <>
      <Button
        variant="secondary"
        {...waitingProps(waiting, props.reasonId)}
        onClick={() => {
          if (!waiting) setOpen(true);
        }}
      >
        {t(schedules > 1 ? "availability.drawer.useSchedule" : "availability.drawer.useOtherDay")}
      </Button>
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

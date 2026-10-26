import { useMemo } from "react";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";
import type { SeriesScope } from "./series-edit.js";
import { useDiscardGuard } from "./use-discard-guard.js";

export interface SpecialHoursEditDrawerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** The service date whose hours are edited. */
  readonly date: string;
  /** Set for "This and following" / "All dates" of a range or repeating rule; absent: this date only. */
  readonly ruleScope?: { readonly ruleId: string; readonly mode: SeriesScope };
  readonly onStale: () => void;
  readonly onClose: () => void;
}

/**
 * Edit on a special-hours row (ux.md F6): the same day drawer and editor the calendar uses, so
 * the save, the stranded-bookings refusal, the version check and Undo are the ones already
 * there. Closing with an unsaved draft asks first.
 */
export function SpecialHoursEditDrawer(props: SpecialHoursEditDrawerProps) {
  const { venueId, state, timezone, today, date, ruleScope, onStale, onClose } = props;
  const guard = useDiscardGuard<null>(onClose);
  const day = useMemo(
    () => resolveDay({ timezone, config: state.config }, date),
    [timezone, state.config, date]
  );

  return (
    <>
      <AvailabilityDayDrawer
        date={date}
        day={day}
        isLoading={false}
        error={null}
        viewerRole="manager"
        editing={{
          venueId,
          state,
          timezone,
          today,
          ruleScope,
          onDirtyChange: guard.setDirty,
          onFinished: () => guard.release(null),
          onStale,
        }}
        onClose={() => guard.request(null)}
      />
      <DiscardChangesDialog
        open={guard.pending !== null}
        date={date}
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
    </>
  );
}

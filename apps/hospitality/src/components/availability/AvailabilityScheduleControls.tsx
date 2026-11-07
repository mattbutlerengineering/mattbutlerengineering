import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, SegmentedControl } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useViewport } from "../../hooks/useViewport.js";
import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import { hasOwnSchedules } from "./schedule-changes.js";
import styles from "./AvailabilityScheduleControls.module.css";

export type AvailabilityTab = "calendar" | "special" | "schedules";

export interface AvailabilityScheduleControlsProps {
  readonly venueId: string;
  /** A Manager also gets the schedule features; a Host sees Calendar and Special dates only. */
  readonly isManager: boolean;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly tab: AvailabilityTab;
  readonly onTabChange: (tab: AvailabilityTab) => void;
  /** Create another schedule…: the Schedules tab with the New schedule editor open. */
  readonly onCreateSchedule: () => void;
  readonly onStale: () => void;
}

/**
 * The Manager's entry points to the schedule features (ux.md Surfaces): the Calendar | Schedules
 * tabs once the venue has a schedule of its own (before that, "Create another schedule…"), and Change
 * regular week… beside the calendar.
 */
export function AvailabilityScheduleControls(props: AvailabilityScheduleControlsProps) {
  const { venueId, isManager, state, today, tab, onTabChange, onCreateSchedule, onStale } = props;
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);
  // On a phone's calendar both schedule actions live in the toolbar's menu (AvailabilityToolbar).
  const inMenu = useViewport() === "phone" && tab === "calendar";
  const showSchedules = isManager && (hasOwnSchedules(state.config) || tab === "schedules");

  return (
    <div className={styles.controls}>
      <SegmentedControl
        aria-label={t("availabilitySchedules.tabsLabel")}
        segments={[
          { id: "calendar", label: t("availabilitySchedules.tabCalendar") },
          { id: "special", label: t("availabilitySpecial.tab") },
          ...(showSchedules
            ? [{ id: "schedules", label: t("availabilitySchedules.tabSchedules") }]
            : []),
        ]}
        value={tab}
        onChange={(id) => onTabChange(id as AvailabilityTab)}
      />
      {isManager && !showSchedules && !inMenu && (
        <Button variant="secondary" onClick={onCreateSchedule}>
          {t("availabilitySchedules.createAnother")}
        </Button>
      )}
      {isManager && tab === "calendar" && !inMenu && (
        <Button variant="secondary" onClick={() => setChanging(true)}>
          {t("availabilitySchedules.regularWeek.open")}
        </Button>
      )}
      {isManager && changing && (
        <ChangeRegularWeekDrawer
          venueId={venueId}
          state={state}
          today={today}
          onStale={onStale}
          onClose={() => setChanging(false)}
          onOpenSchedules={() => onTabChange("schedules")}
        />
      )}
    </div>
  );
}

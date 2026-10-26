import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, SegmentedControl } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import styles from "./AvailabilityScheduleControls.module.css";

export type AvailabilityTab = "calendar" | "schedules";

export interface AvailabilityScheduleControlsProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly tab: AvailabilityTab;
  readonly onTabChange: (tab: AvailabilityTab) => void;
  readonly onStale: () => void;
}

/**
 * The Manager's entry points to the schedule features (ux.md Surfaces): the Calendar | Schedules
 * tabs once the venue has two schedules (before that, "Create another schedule…"), and Change
 * regular week… beside the calendar.
 */
export function AvailabilityScheduleControls(props: AvailabilityScheduleControlsProps) {
  const { venueId, state, today, tab, onTabChange, onStale } = props;
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);
  const scheduleCount = state.config.schedules.filter((s) => !s.archivedAt).length;
  const showTabs = scheduleCount >= 2 || tab === "schedules";

  return (
    <div className={styles.controls}>
      {showTabs ? (
        <SegmentedControl
          aria-label={t("availabilitySchedules.tabsLabel")}
          segments={[
            { id: "calendar", label: t("availabilitySchedules.tabCalendar") },
            { id: "schedules", label: t("availabilitySchedules.tabSchedules") },
          ]}
          value={tab}
          onChange={(id) => onTabChange(id as AvailabilityTab)}
        />
      ) : (
        <Button variant="ghost" onClick={() => onTabChange("schedules")}>
          {t("availabilitySchedules.createAnother")}
        </Button>
      )}
      {tab === "calendar" && (
        <Button variant="secondary" onClick={() => setChanging(true)}>
          {t("availabilitySchedules.regularWeek.open")}
        </Button>
      )}
      {changing && (
        <ChangeRegularWeekDrawer
          venueId={venueId}
          state={state}
          today={today}
          onStale={onStale}
          onClose={() => setChanging(false)}
        />
      )}
    </div>
  );
}

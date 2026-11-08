import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@mattbutlerengineering/rialto";
import type { AvailabilityTab } from "./availability-entry.js";
import styles from "./AvailabilityScheduleControls.module.css";

export interface AvailabilityScheduleControlsProps {
  /** A Manager also gets the Schedules layer; a Host sees Calendar and Special dates only. */
  readonly isManager: boolean;
  readonly tab: AvailabilityTab;
  readonly onTabChange: (tab: AvailabilityTab) => void;
}

/**
 * The layer control (ux.md S-Avail2): Schedules | Calendar | Special dates, in that order, with
 * the Schedules layer always there for a Manager, even with one schedule.
 */
export function AvailabilityScheduleControls(props: AvailabilityScheduleControlsProps) {
  const { isManager, tab, onTabChange } = props;
  const { t } = useTranslation();

  return (
    <div className={styles.controls}>
      <SegmentedControl
        aria-label={t("availabilitySchedules.tabsLabel")}
        segments={[
          ...(isManager
            ? [{ id: "schedules", label: t("availabilitySchedules.tabSchedules") }]
            : []),
          { id: "calendar", label: t("availabilitySchedules.tabCalendar") },
          { id: "special", label: t("availabilitySpecial.tab") },
        ]}
        value={tab}
        onChange={(id) => onTabChange(id as AvailabilityTab)}
      />
    </div>
  );
}

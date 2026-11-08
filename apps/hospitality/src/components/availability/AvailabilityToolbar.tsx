import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  IconButton,
  SegmentedControl,
  Text,
} from "@mattbutlerengineering/rialto";
import type { Viewport } from "../../hooks/useViewport.js";
import type { CalendarView } from "./calendar-dates.js";
import type { ServiceFilter } from "./service-filter.js";
import { ServicesFilterSelect } from "./ServicesFilterSelect.js";
import styles from "./AvailabilityToolbar.module.css";

type MenuItems = ComponentProps<typeof DropdownMenu>["items"];
type MenuEntry = MenuItems[number];

export interface AvailabilityToolbarProps {
  readonly viewport: Viewport;
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
  /** "November 2026", or the week on show. */
  readonly period: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onToday: () => void;
  readonly onHistory: () => void;
  readonly onGoToDate: () => void;
  /** Ways to pick days (the Select… menu). */
  readonly selectItems: MenuItems;
  /** Absent for anyone who cannot close (a Host, or no config loaded). */
  readonly onClose?: () => void;
  /** Absent as above, and while online booking is already paused. */
  readonly onPause?: () => void;
  /** Absent as above: the schedule action the page's controls hold on a wider screen. */
  readonly onChangeRegularWeek?: () => void;
  /** Phone only: the services the Services filter offers; empty (or absent) hides it. */
  readonly services?: readonly ServiceFilter[];
  /** The service the calendar reads for, or `null` for all. */
  readonly serviceFilterId?: string | null;
  readonly onServiceFilterChange?: (id: string | null) => void;
  /** Booking rules… (Managers): how far ahead, notice, largest party. */
  readonly onBookingRules?: () => void;
}

/**
 * A menu puts focus back on its trigger a frame after it closes. An overlay opened in the same
 * frame would lose focus to that restore, so it opens once the restore has been scheduled.
 */
function afterMenuCloses(open: () => void) {
  return () => {
    requestAnimationFrame(open);
  };
}

const DIVIDER: MenuEntry = { type: "divider" };

/**
 * The calendar's controls, in three groups: where you are (date navigation), how you look at it
 * (Month | Week) and what you can do. On a phone the third group folds into one menu, so the
 * calendar keeps the first screen. The menu leads with what changes the hours — the buttons a
 * wider screen shows beside the tabs — then closing and pausing, then the ways to pick days, and
 * ends with getting around (Go to date, History), so the configuration it holds is never below
 * the fold.
 */
export function AvailabilityToolbar(props: AvailabilityToolbarProps) {
  const { viewport, view, period, selectItems, onClose, onPause } = props;
  const { onChangeRegularWeek, onHistory, onBookingRules } = props;
  const { t } = useTranslation();
  const bookingRulesItems: MenuItems = onBookingRules
    ? [
        {
          id: "booking-rules",
          label: t("availability.bookingRules.open"),
          onSelect: afterMenuCloses(onBookingRules),
        },
      ]
    : [];

  const { services = [], serviceFilterId = null, onServiceFilterChange } = props;
  // A phone's toolbar holds the filter on a row of its own; wider screens put it beside the week
  // summary (AvailabilityPage), where the toolbar has no width to spare.
  const serviceFilter = onServiceFilterChange ? (
    <ServicesFilterSelect
      services={services}
      value={serviceFilterId}
      onChange={onServiceFilterChange}
    />
  ) : null;

  const dateNavigation = (
    <div className={styles.group}>
      <IconButton
        variant="secondary"
        aria-label={t("availability.toolbar.previous")}
        icon={<Text aria-hidden="true">‹</Text>}
        onClick={props.onPrevious}
      />
      <IconButton
        variant="secondary"
        aria-label={t("availability.toolbar.next")}
        icon={<Text aria-hidden="true">›</Text>}
        onClick={props.onNext}
      />
      <Button variant="secondary" onClick={props.onToday}>
        {t("availability.toolbar.today")}
      </Button>
      <Text variant="body" color="primary" aria-live="polite" className={styles.period}>
        {period}
      </Text>
    </div>
  );
  const viewSwitch = (
    <SegmentedControl
      aria-label={t("availability.toolbar.viewLabel")}
      segments={[
        { id: "month", label: t("availability.toolbar.month") },
        { id: "week", label: t("availability.toolbar.week") },
      ]}
      value={view}
      onChange={(id) => props.onViewChange(id as CalendarView)}
    />
  );

  if (viewport === "phone") {
    const actionItems: MenuItems = [
      ...(onClose
        ? [
            {
              id: "close",
              label: t("availability.close.open"),
              onSelect: afterMenuCloses(onClose),
            },
          ]
        : []),
      ...(onPause
        ? [
            {
              id: "pause",
              label: t("availability.paused.open"),
              onSelect: afterMenuCloses(onPause),
            },
          ]
        : []),
    ];
    const scheduleItems: MenuItems = [
      ...(onChangeRegularWeek
        ? [
            {
              id: "regular-week",
              label: t("availabilitySchedules.regularWeek.open"),
              onSelect: afterMenuCloses(onChangeRegularWeek),
            },
          ]
        : []),
      ...bookingRulesItems,
    ];
    const navigationItems: MenuItems = [
      {
        id: "go-to-date",
        label: t("availability.toolbar.goToDate"),
        onSelect: afterMenuCloses(props.onGoToDate),
      },
      {
        id: "history",
        label: t("availability.historyButton"),
        onSelect: afterMenuCloses(onHistory),
      },
    ];
    const items: MenuItems = [scheduleItems, actionItems, selectItems, navigationItems]
      .filter((group) => group.length > 0)
      .flatMap((group, i) => (i === 0 ? group : [DIVIDER, ...group]));
    return (
      <div className={styles.toolbar}>
        {dateNavigation}
        <div className={styles.phoneRow}>
          {viewSwitch}
          <DropdownMenu
            align="right"
            trigger={<Button variant="secondary">{t("availability.toolbar.more")}</Button>}
            items={items}
          />
        </div>
        {serviceFilter}
      </div>
    );
  }

  return (
    <div className={styles.toolbar}>
      {dateNavigation}
      {viewSwitch}
      <div className={styles.actions}>
        <DropdownMenu
          align="right"
          trigger={
            <IconButton
              variant="secondary"
              className={styles.moreTrigger}
              aria-label={t("availability.toolbar.more")}
              icon={<Text aria-hidden="true">⋯</Text>}
            />
          }
          items={[
            {
              id: "history",
              label: t("availability.historyButton"),
              onSelect: afterMenuCloses(onHistory),
            },
            {
              id: "go-to-date",
              label: t("availability.toolbar.goToDate"),
              onSelect: afterMenuCloses(props.onGoToDate),
            },
            ...bookingRulesItems,
          ]}
        />
        {selectItems.length > 0 && (
          <DropdownMenu
            trigger={<Button variant="secondary">{t("availability.selection.selectMenu")}</Button>}
            items={selectItems}
          />
        )}
        {onClose && (
          <Button variant="secondary" onClick={onClose}>
            {t("availability.close.open")}
          </Button>
        )}
        {onPause && (
          <Button variant="secondary" onClick={onPause}>
            {t("availability.paused.open")}
          </Button>
        )}
      </div>
    </div>
  );
}

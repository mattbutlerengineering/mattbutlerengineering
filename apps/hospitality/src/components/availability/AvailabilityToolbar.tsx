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

export interface AvailabilityToolbarProps {
  readonly viewport: Viewport;
  readonly view: CalendarView;
  readonly onViewChange: (view: CalendarView) => void;
  /** "November 2026", or the week on show. */
  readonly period: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onToday: () => void;
  /** Ways to pick days (the Select… menu). */
  readonly selectItems: MenuItems;
  /** Phone only: the services the Services filter offers; empty (or absent) hides it. */
  readonly services?: readonly ServiceFilter[];
  /** The service the calendar reads for, or `null` for all. */
  readonly serviceFilterId?: string | null;
  readonly onServiceFilterChange?: (id: string | null) => void;
}

/**
 * The calendar's controls, in two groups: where you are (date navigation) and how you look at it
 * (Month | Week), then Select… for picking days. The page-level actions (Close…, Pause, ⋯) live in
 * the page header on every layer. On a phone Select… is one menu of its own, so the page has one ⋯.
 */
export function AvailabilityToolbar(props: AvailabilityToolbarProps) {
  const { viewport, view, period, selectItems } = props;
  const { t } = useTranslation();

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

  const selectMenu =
    selectItems.length > 0 ? (
      <DropdownMenu
        trigger={<Button variant="secondary">{t("availability.selection.selectMenu")}</Button>}
        items={selectItems}
        align="right"
      />
    ) : null;

  if (viewport === "phone") {
    return (
      <div className={styles.toolbar}>
        {dateNavigation}
        <div className={styles.phoneRow}>
          {viewSwitch}
          {selectMenu}
        </div>
        {serviceFilter}
      </div>
    );
  }

  return (
    <div className={styles.toolbar}>
      {dateNavigation}
      {viewSwitch}
      {selectMenu && <div className={styles.actions}>{selectMenu}</div>}
    </div>
  );
}

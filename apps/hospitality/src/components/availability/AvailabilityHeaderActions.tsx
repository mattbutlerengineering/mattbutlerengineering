import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Button, DropdownMenu, IconButton, Text } from "@mattbutlerengineering/rialto";
import type { Viewport } from "../../hooks/useViewport.js";
import styles from "./AvailabilityHeaderActions.module.css";

type MenuItems = ComponentProps<typeof DropdownMenu>["items"];

export interface AvailabilityHeaderActionsProps {
  readonly viewport: Viewport;
  /** Disabled while the role or the config is still being read: the actions open on both. */
  readonly pending: boolean;
  /** Absent while online booking is already paused (the banner offers Resume). */
  readonly onPause?: () => void;
  /** The Manager-only actions are absent for a Host, who keeps Go to date. */
  readonly onClose?: () => void;
  readonly onCompareServices?: () => void;
  /** Absent when the venue has no regular week to copy. */
  readonly onDuplicateRegularWeek?: () => void;
  readonly onGoToDate: () => void;
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

/**
 * The Manager's page-level actions, the same on every layer (ux.md S-Avail2, F7): Close…, Pause
 * online booking and a ⋯ menu. A phone keeps Close… and folds Pause into ⋯, at the top, so the
 * night-of actions are one interaction on a desktop and two on a phone. A Host is given none of
 * the Manager actions but keeps Go to date in ⋯. History is the hub's own link (availability-hub
 * C2.6).
 */
export function AvailabilityHeaderActions(props: AvailabilityHeaderActionsProps) {
  const { viewport, pending, onPause, onClose } = props;
  const { t } = useTranslation();

  const menuItems: MenuItems = [
    ...(viewport === "phone" && onPause
      ? [{ id: "pause", label: t("availability.paused.open"), onSelect: afterMenuCloses(onPause) }]
      : []),
    ...(props.onCompareServices
      ? [
          {
            id: "compare-services",
            label: t("availabilitySchedules.compare.open"),
            onSelect: afterMenuCloses(props.onCompareServices),
          },
        ]
      : []),
    ...(props.onDuplicateRegularWeek
      ? [
          {
            id: "duplicate-regular-week",
            label: t("availabilitySchedules.regularWeek.duplicate"),
            onSelect: afterMenuCloses(props.onDuplicateRegularWeek),
          },
        ]
      : []),
    {
      id: "go-to-date",
      label: t("availability.toolbar.goToDate"),
      onSelect: afterMenuCloses(props.onGoToDate),
    },
  ];

  return (
    <div className={styles.actions}>
      {onClose && (
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t("availability.close.open")}
        </Button>
      )}
      {viewport !== "phone" && onPause && (
        <Button variant="secondary" disabled={pending} onClick={onPause}>
          {t("availability.paused.open")}
        </Button>
      )}
      <DropdownMenu
        align="right"
        trigger={
          <IconButton
            variant="secondary"
            className={styles.moreTrigger}
            disabled={pending}
            aria-label={t("availability.toolbar.more")}
            icon={<Text aria-hidden="true">⋯</Text>}
          />
        }
        items={menuItems}
      />
    </div>
  );
}

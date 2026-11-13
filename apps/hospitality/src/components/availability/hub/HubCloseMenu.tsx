import { useTranslation } from "react-i18next";
import { Button, DropdownMenu } from "@mattbutlerengineering/rialto";
import type { AvailabilityScope } from "../../../hooks/useAvailabilityScope.js";
import styles from "./Hub.module.css";

/**
 * A menu puts focus back on its trigger a frame after it closes; the dialog opens after that, so
 * it hands focus back to "Close or pause" once it is done.
 */
const afterMenuCloses = (open: () => void) => () => {
  requestAnimationFrame(open);
};

/**
 * The hub's "Close or pause" (availability-hub ux.md "Close and Pause dialogs"): a menu of two,
 * for a Manager only. Each item opens its dialog over the hub through the layout.
 */
export function HubCloseMenu({
  openClose,
  openPause,
}: Pick<AvailabilityScope, "openClose" | "openPause">) {
  const { t } = useTranslation();
  return (
    <div className={styles.closeMenu}>
      <DropdownMenu
        align="right"
        trigger={<Button variant="secondary">{t("availabilityHub.closeMenu.open")}</Button>}
        items={[
          {
            id: "close",
            label: t("availabilityHub.closeMenu.close"),
            onSelect: afterMenuCloses(() => openClose({ kind: "venue" })),
          },
          {
            id: "pause",
            label: t("availabilityHub.closeMenu.pause"),
            onSelect: afterMenuCloses(openPause),
          },
        ]}
      />
    </div>
  );
}

HubCloseMenu.displayName = "HubCloseMenu";

import type { KeyboardEvent } from "react";
import { Button, DropdownMenu, StatusLED, Text } from "@mattbutlerengineering/rialto";
import type { TableStatus } from "@mbe/types";
import { tableStatusMenuItems, tableStatusWord } from "./table-status-menu.js";
import styles from "./TableStatusMenu.module.css";

export interface TableStatusMenuProps {
  tableId: string;
  /** As the row names it — "Table 3". */
  tableName: string;
  status: TableStatus;
  /** A change is in flight: gold treatment, trigger disabled, menu shut. */
  pending?: boolean;
  /** Fires once, on item select — never on trigger activation. */
  onChange: (next: TableStatus) => void;
}

type LedVariant = "success" | "warning" | "danger" | "neutral" | "off";

/* Gold is reserved for the in-flight pulse (ux.md Conventions), so no resting state reads accent. */
const LED_VARIANT: Partial<Record<TableStatus, LedVariant>> = {
  AVAILABLE: "success",
  OCCUPIED: "danger",
  DIRTY: "warning",
  READY: "neutral",
};

/**
 * rialto's DropdownMenu opens a closed trigger on Enter/Space; the APG menu
 * button also opens on ArrowDown, so the trigger turns that key into its click.
 */
function openOnArrowDown(e: KeyboardEvent<HTMLButtonElement>) {
  const trigger = e.currentTarget;
  if (e.key !== "ArrowDown" || trigger.disabled) return;
  if (trigger.getAttribute("aria-expanded") === "true") return;
  e.preventDefault();
  trigger.click();
}

export function TableStatusMenu({
  tableId,
  tableName,
  status,
  pending = false,
  onChange,
}: TableStatusMenuProps) {
  const items = tableStatusMenuItems(status);
  const word = tableStatusWord(status);

  return (
    <DropdownMenu
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.trigger} ${pending ? styles.pending : ""}`}
          aria-label={`${tableName}: ${word}. Change status`}
          data-testid={`table-status-${tableId}`}
          disabled={pending || items.length === 0}
          onKeyDown={openOnArrowDown}
        >
          <StatusLED variant={LED_VARIANT[status] ?? "off"} size="xs" pulse={pending} />
          <Text as="span" variant="label">
            {word}
          </Text>
          <Text as="span" variant="caption" className={styles.chevron} aria-hidden="true">
            ▾
          </Text>
        </Button>
      }
      items={items.map((item) => ({
        id: item.id,
        label: item.label,
        onSelect: () => onChange(item.id),
      }))}
    />
  );
}

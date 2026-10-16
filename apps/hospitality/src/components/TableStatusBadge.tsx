import { useTranslation } from "react-i18next";
import { Tag } from "@mattbutlerengineering/rialto";
import type { TableStatus } from "@mbe/types";

interface TableStatusBadgeProps {
  status: TableStatus;
  size?: "sm" | "md";
  onClick?: () => void;
}

const STATUS_LABEL_KEYS = {
  AVAILABLE: "floorPlan.tableStatus.available",
  OCCUPIED: "floorPlan.tableStatus.occupied",
  DIRTY: "floorPlan.tableStatus.dirty",
  READY: "floorPlan.tableStatus.ready",
} as const satisfies Record<TableStatus, string>;

const STATUS_VARIANTS: Record<TableStatus, "success" | "error" | "default" | "accent"> = {
  AVAILABLE: "success",
  OCCUPIED: "error",
  DIRTY: "default",
  READY: "accent",
};

export function TableStatusBadge({ status, size: _size = "md", onClick }: TableStatusBadgeProps) {
  const { t } = useTranslation();
  const label = t(STATUS_LABEL_KEYS[status]);
  const variant = STATUS_VARIANTS[status];

  return (
    <Tag variant={variant} onClick={onClick} className={onClick ? "clickable" : undefined}>
      {label}
    </Tag>
  );
}

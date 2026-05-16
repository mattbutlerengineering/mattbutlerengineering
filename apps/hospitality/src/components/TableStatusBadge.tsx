import { Tag } from "@mattbutlerengineering/rialto";
import type { TableStatus } from "@mbe/types";

interface TableStatusBadgeProps {
  status: TableStatus;
  size?: "sm" | "md";
  onClick?: () => void;
}

const STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  DIRTY: "Dirty",
  READY: "Ready",
};

const STATUS_VARIANTS: Record<TableStatus, "success" | "error" | "default" | "accent"> = {
  AVAILABLE: "success",
  OCCUPIED: "error",
  DIRTY: "default",
  READY: "accent",
};

export function TableStatusBadge({ status, size: _size = "md", onClick }: TableStatusBadgeProps) {
  const label = STATUS_LABELS[status];
  const variant = STATUS_VARIANTS[status];

  return (
    <Tag variant={variant} onClick={onClick} className={onClick ? "clickable" : undefined}>
      {label}
    </Tag>
  );
}

import type { TableStatus } from "@mbe/types";
import styles from "./TableStatusBadge.module.css";

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

export function TableStatusBadge({ status, size = "md", onClick }: TableStatusBadgeProps) {
  const className = [
    styles.badge,
    styles[`status_${status}`],
    styles[`size_${size}`],
    onClick ? styles.clickable : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = STATUS_LABELS[status];

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}

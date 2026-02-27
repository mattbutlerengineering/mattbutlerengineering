import { STATUS_COLORS } from "../../lib/constants";

interface StatusBadgeProps {
  readonly status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  const isRunning = status === "running";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span style={{ color }}>{status}</span>
    </span>
  );
}

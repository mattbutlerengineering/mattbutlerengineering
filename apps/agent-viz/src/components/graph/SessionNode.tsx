import { motion } from "framer-motion";
import type { Session } from "../../types";
import { STATUS_COLORS } from "../../lib/constants";

interface SessionNodeProps {
  readonly session: Session;
  readonly x: number;
  readonly y: number;
  readonly selected: boolean;
  readonly onClick: (session: Session) => void;
}

const WIDTH = 100;
const HEIGHT = 32;

export function SessionNode({ session, x, y, selected, onClick }: SessionNodeProps) {
  const statusColor = STATUS_COLORS[session.status] ?? STATUS_COLORS.pending;
  const isRunning = session.status === "running";

  return (
    <motion.g
      onClick={() => onClick(session)}
      className="cursor-pointer"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Background */}
      <rect
        x={x - WIDTH / 2}
        y={y - HEIGHT / 2}
        width={WIDTH}
        height={HEIGHT}
        rx={6}
        fill={selected ? `${statusColor}22` : "#1e1e38"}
        stroke={selected ? statusColor : "#3a3a5e"}
        strokeWidth={selected ? 1.5 : 1}
      />

      {/* Status indicator */}
      <circle
        cx={x - WIDTH / 2 + 12}
        cy={y}
        r={3}
        fill={statusColor}
      >
        {isRunning && (
          <animate
            attributeName="opacity"
            values="1;0.3;1"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Truncated label */}
      <text
        x={x - WIDTH / 2 + 22}
        y={y + 1}
        dominantBaseline="central"
        fill="#ccc"
        fontSize={9}
        fontFamily="inherit"
      >
        {session.taskDescription.length > 12
          ? session.taskDescription.slice(0, 12) + "..."
          : session.taskDescription}
      </text>
    </motion.g>
  );
}

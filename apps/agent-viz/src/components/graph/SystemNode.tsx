import { motion } from "framer-motion";
import type { NodeId } from "../../types";
import { NODE_POSITIONS, NODE_COLORS } from "../../lib/constants";

interface SystemNodeProps {
  readonly nodeId: NodeId;
  readonly active: boolean;
  readonly onClick?: () => void;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 40;

export function SystemNode({ nodeId, active, onClick }: SystemNodeProps) {
  const pos = NODE_POSITIONS[nodeId];
  const color = NODE_COLORS[nodeId];

  return (
    <g
      onClick={onClick}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
    >
      {/* Glow effect when active */}
      {active && (
        <motion.rect
          x={pos.x - NODE_WIDTH / 2 - 4}
          y={pos.y - NODE_HEIGHT / 2 - 4}
          width={NODE_WIDTH + 8}
          height={NODE_HEIGHT + 8}
          rx={12}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.4}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Node background */}
      <rect
        x={pos.x - NODE_WIDTH / 2}
        y={pos.y - NODE_HEIGHT / 2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        fill={active ? `${color}22` : "#232340"}
        stroke={active ? color : "#3a3a5e"}
        strokeWidth={1.5}
      />

      {/* Label */}
      <text
        x={pos.x}
        y={pos.y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={active ? color : "#999"}
        fontSize={11}
        fontWeight={500}
        fontFamily="inherit"
      >
        {pos.label}
      </text>
    </g>
  );
}

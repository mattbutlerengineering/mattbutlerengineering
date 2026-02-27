import type { NodeId } from "../../types";
import { NODE_POSITIONS } from "../../lib/constants";

// ── Connection definitions ──────────────────────────────────────────

export interface Connection {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly path: string;
}

function buildPath(from: NodeId, to: NodeId): string {
  const a = NODE_POSITIONS[from];
  const b = NODE_POSITIONS[to];
  const midY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
}

export const CONNECTIONS: readonly Connection[] = [
  { from: "orchestrator", to: "session-api", path: buildPath("orchestrator", "session-api") },
  { from: "session-api", to: "agent-core", path: buildPath("session-api", "agent-core") },
  { from: "agent-core", to: "claude-sdk", path: buildPath("agent-core", "claude-sdk") },
  { from: "agent-core", to: "git", path: buildPath("agent-core", "git") },
  { from: "agent-core", to: "github", path: buildPath("agent-core", "github") },
];

// ── Path interpolation for particle animation ───────────────────────

export function getPathEndpoints(
  from: NodeId,
  to: NodeId
): { x1: number; y1: number; x2: number; y2: number } {
  const a = NODE_POSITIONS[from];
  const b = NODE_POSITIONS[to];
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

// ── Child session positions (horizontal row between orchestrator and session-api) ──

export function getChildSessionPositions(
  count: number
): readonly { x: number; y: number }[] {
  const y = (NODE_POSITIONS.orchestrator.y + NODE_POSITIONS["session-api"].y) / 2;
  const totalWidth = Math.min(count * 120, 600);
  const startX = 400 - totalWidth / 2 + 60;

  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (totalWidth / count),
    y,
  }));
}

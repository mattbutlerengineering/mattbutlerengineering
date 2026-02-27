import type { NodeId } from "../types";

// ── Colors ──────────────────────────────────────────────────────────

export const EVENT_COLORS: Record<string, string> = {
  "session:start": "#5b8def",
  "session:tool_use": "#5b8def",
  "session:tool_result": "#9b72cf",
  "session:assistant": "#d4a853",
  "session:message": "#5b8def",
  "session:complete": "#4caf7d",
  "session:error": "#e05555",
  "session:cancelled": "#e05555",
  "orchestrator:start": "#d4a853",
  "orchestrator:session_created": "#d4a853",
  "orchestrator:complete": "#4caf7d",
  default: "#5b8def",
};

export const NODE_COLORS: Record<NodeId, string> = {
  orchestrator: "#d4a853",
  "session-api": "#5b8def",
  "agent-core": "#9b72cf",
  "claude-sdk": "#5b8def",
  git: "#4caf7d",
  github: "#4caf7d",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "#888",
  running: "#5b8def",
  succeeded: "#4caf7d",
  failed: "#e05555",
  cancelled: "#888",
};

// ── Animation timings ───────────────────────────────────────────────

export const PARTICLE_DURATION_S = 0.8;
export const PARTICLE_LIFETIME_MS = 1200;
export const SESSION_POLL_INTERVAL_MS = 3000;

// ── Graph layout (SVG viewBox: 0 0 800 600) ────────────────────────

export interface NodePosition {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export const NODE_POSITIONS: Record<NodeId, NodePosition> = {
  orchestrator: { x: 400, y: 60, label: "Orchestrator" },
  "session-api": { x: 400, y: 240, label: "Session API" },
  "agent-core": { x: 400, y: 380, label: "Agent Core" },
  "claude-sdk": { x: 200, y: 520, label: "Claude SDK" },
  git: { x: 400, y: 520, label: "Git" },
  github: { x: 600, y: 520, label: "GitHub" },
};

// ── Tool → node mapping ─────────────────────────────────────────────

const SDK_TOOLS = new Set(["Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit"]);
const GIT_TOOLS = new Set(["Bash"]);

export function getToolTargetNode(toolName: string | undefined): NodeId {
  if (!toolName) return "claude-sdk";
  if (SDK_TOOLS.has(toolName)) return "claude-sdk";
  if (GIT_TOOLS.has(toolName)) return "git";
  return "claude-sdk";
}

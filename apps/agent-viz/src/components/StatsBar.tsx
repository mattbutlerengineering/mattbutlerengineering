import type { Session } from "../types";
import { CostDisplay } from "./shared/CostDisplay";

interface StatsBarProps {
  readonly sessions: readonly Session[];
  readonly mockMode: boolean;
}

export function StatsBar({ sessions, mockMode }: StatsBarProps) {
  const totalSessions = sessions.length;
  const running = sessions.filter((s) => s.status === "running").length;
  const totalCost = sessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  const prs = sessions.filter((s) => s.prUrl !== null).length;

  return (
    <header className="flex items-center justify-between border-b border-gray-700/50 bg-surface px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-accent-gold" />
        <h1 className="text-sm font-semibold text-gray-100">Agent Visualizer</h1>
        {mockMode && (
          <span className="rounded bg-accent-gold/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-gold">
            MOCK
          </span>
        )}
      </div>

      <div className="flex items-center gap-6 text-xs text-gray-400">
        <div>
          Sessions: <span className="text-gray-200">{totalSessions}</span>
        </div>
        <div>
          Running: <span className="text-accent-blue">{running}</span>
        </div>
        <div>
          PRs: <span className="text-accent-green">{prs}</span>
        </div>
        <div>
          Cost: <CostDisplay costUsd={totalCost} className="text-gray-200 text-xs" />
        </div>
      </div>
    </header>
  );
}

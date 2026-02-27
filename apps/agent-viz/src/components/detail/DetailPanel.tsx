import type { Session, SessionEvent } from "../../types";
import { StatusBadge } from "../shared/StatusBadge";
import { CostDisplay } from "../shared/CostDisplay";
import { EventLog } from "./EventLog";
import { PayloadViewer } from "./PayloadViewer";

interface DetailPanelProps {
  readonly session: Session | null;
  readonly events: readonly SessionEvent[];
  readonly selectedEvent: SessionEvent | null;
  readonly onSelectEvent: (event: SessionEvent) => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function DetailPanel({
  session,
  events,
  selectedEvent,
  onSelectEvent,
}: DetailPanelProps) {
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-gray-500">
        Select a session to view details
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Session header */}
      <div className="border-b border-gray-700/50 p-3">
        <div className="mb-1 truncate text-xs font-medium text-gray-200">
          {session.taskDescription}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <StatusBadge status={session.status} />
          <CostDisplay costUsd={session.costUsd} className="text-gray-400" />
          <span className="text-gray-500">{formatDuration(session.durationMs)}</span>
        </div>
        {session.prUrl && (
          <a
            href={session.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-[10px] text-accent-green hover:underline"
          >
            PR #{session.prNumber}
          </a>
        )}
        <div className="mt-1 font-mono text-[9px] text-gray-600">
          {session.id}
        </div>
      </div>

      {/* Event log */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EventLog
          events={events}
          selectedEventId={selectedEvent?.id ?? null}
          onSelect={onSelectEvent}
        />
      </div>

      {/* Payload viewer */}
      {selectedEvent && <PayloadViewer data={selectedEvent.data} />}
    </div>
  );
}

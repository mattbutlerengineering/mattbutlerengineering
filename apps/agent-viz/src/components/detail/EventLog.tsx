import { useRef, useEffect } from "react";
import type { SessionEvent } from "../../types";
import { EVENT_COLORS } from "../../lib/constants";

const MAX_VISIBLE_EVENTS = 100;

interface EventLogProps {
  readonly events: readonly SessionEvent[];
  readonly selectedEventId: string | null;
  readonly onSelect: (event: SessionEvent) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function getEventLabel(event: SessionEvent): string {
  const data = event.data as Record<string, unknown>;

  if (typeof data.toolName === "string") {
    const input = data.toolInput as Record<string, unknown> | undefined;
    const detail = stringify(
      input?.file_path ?? input?.command ?? input?.pattern ?? ""
    );
    const shortDetail =
      detail.length > 30 ? "..." + detail.slice(-30) : detail;
    return `${data.toolName}${shortDetail ? ` ${shortDetail}` : ""}`;
  }

  if (typeof data.textPreview === "string") {
    return data.textPreview.length > 50
      ? data.textPreview.slice(0, 50) + "..."
      : data.textPreview;
  }

  if (data.message !== undefined && data.message !== null) {
    const msg = stringify(data.message);
    return msg.length > 80 ? msg.slice(0, 80) + "..." : msg;
  }

  return event.type.replace("session:", "").replace("orchestrator:", "");
}

export function EventLog({ events, selectedEventId, onSelect }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-gray-500">
        Waiting for events...
      </div>
    );
  }

  const truncated = events.length > MAX_VISIBLE_EVENTS;
  const visibleEvents = truncated ? events.slice(-MAX_VISIBLE_EVENTS) : events;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Event Log
        </span>
        <span className="text-[10px] text-gray-600">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      {truncated && (
        <div className="px-3 pb-1 text-[9px] text-gray-600">
          Showing latest {MAX_VISIBLE_EVENTS} of {events.length}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {visibleEvents.map((event) => {
          const color = EVENT_COLORS[event.type] ?? EVENT_COLORS.default;
          const isSelected = selectedEventId === event.id;

          return (
            <button
              key={event.id}
              onClick={() => onSelect(event)}
              className={`flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ${
                isSelected
                  ? "bg-surface-lighter"
                  : "hover:bg-surface-light"
              }`}
            >
              <span className="shrink-0 pt-0.5 font-mono text-[9px] text-gray-600">
                {formatTime(event.createdAt)}
              </span>
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="min-w-0 truncate text-[11px] text-gray-300">
                {getEventLabel(event)}
              </span>
            </button>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

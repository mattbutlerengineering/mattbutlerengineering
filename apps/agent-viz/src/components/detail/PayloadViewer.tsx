import { useState } from "react";

interface PayloadViewerProps {
  readonly data: Record<string, unknown>;
}

export function PayloadViewer({ data }: PayloadViewerProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-t border-gray-700/50 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          &#9654;
        </span>
        Payload
      </button>
      {expanded && (
        <pre className="overflow-x-auto rounded bg-surface p-2 text-[10px] leading-relaxed text-gray-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

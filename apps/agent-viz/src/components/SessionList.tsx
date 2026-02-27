import type { SessionTree } from "../types";
import { StatusBadge } from "./shared/StatusBadge";
import { CostDisplay } from "./shared/CostDisplay";

interface SessionListProps {
  readonly trees: readonly SessionTree[];
  readonly selectedId: string | null;
  readonly onSelect: (parentId: string) => void;
}

export function SessionList({ trees, selectedId, onSelect }: SessionListProps) {
  if (trees.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-gray-500">
        No sessions yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Sessions
      </div>
      {trees.map((tree) => {
        const isSelected = selectedId === tree.parent.id;
        const totalCost = [tree.parent, ...tree.children].reduce(
          (sum, s) => sum + (s.costUsd ?? 0),
          0
        );

        return (
          <button
            key={tree.parent.id}
            onClick={() => onSelect(tree.parent.id)}
            className={`group w-full rounded-md px-2.5 py-2 text-left transition-colors ${
              isSelected
                ? "bg-surface-lighter text-gray-100"
                : "text-gray-400 hover:bg-surface-light hover:text-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {tree.parent.taskDescription}
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <StatusBadge status={tree.parent.status} />
                  {tree.children.length > 0 && (
                    <span className="text-[10px] text-gray-500">
                      {tree.children.length} child{tree.children.length !== 1 ? "ren" : ""}
                    </span>
                  )}
                </div>
              </div>
              <CostDisplay costUsd={totalCost > 0 ? totalCost : null} className="text-[10px] text-gray-500" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

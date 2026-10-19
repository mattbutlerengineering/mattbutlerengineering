import { useRef, type DragEvent } from "react";
import { moveId } from "./reorder.js";

/**
 * Native drag-and-drop reorder for a list of ids. The grip is the drag source
 * (`handleProps`) and the whole row is the drop target (`rowProps`), so text
 * fields inside a row stay selectable. Keyboard users reorder with the
 * move-up/down buttons instead — drag is the pointer shortcut, not the only way.
 */
export function useDragReorder(ids: readonly string[], onReorder: (ids: string[]) => void) {
  const draggedRef = useRef<string | null>(null);

  return {
    handleProps: (id: string) => ({
      draggable: true as const,
      onDragStart: (event: DragEvent) => {
        draggedRef.current = id;
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      },
    }),
    rowProps: (id: string) => ({
      onDragOver: (event: DragEvent) => {
        if (draggedRef.current) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const from = draggedRef.current;
        draggedRef.current = null;
        if (from && from !== id) onReorder(moveId(ids, from, ids.indexOf(id)));
      },
    }),
  };
}

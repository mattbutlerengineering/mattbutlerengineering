import { useState, useCallback } from "react";

export interface TimelineReservationEntry {
  reservationId: string;
  tableIndex: number;
}

export interface UseTimelineKeyboardParams {
  entries: TimelineReservationEntry[];
  onActivate?: (reservationId: string) => void;
}

export interface UseTimelineKeyboardResult {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useTimelineKeyboard({
  entries,
  onActivate,
}: UseTimelineKeyboardParams): UseTimelineKeyboardResult {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (entries.length === 0) return;

      const currentIndex = focusedId
        ? entries.findIndex((entry) => entry.reservationId === focusedId)
        : -1;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          if (focusedId !== null) {
            const nextIdx = Math.min(currentIndex + 1, entries.length - 1);
            setFocusedId(entries[nextIdx].reservationId);
          } else {
            setFocusedId(entries[0].reservationId);
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (focusedId !== null) {
            const prevIdx = Math.max(currentIndex - 1, 0);
            setFocusedId(entries[prevIdx].reservationId);
          } else {
            setFocusedId(entries[entries.length - 1].reservationId);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (focusedId !== null) {
            const current = entries[currentIndex];
            const nextRowEntries = entries.filter(
              (entry) => entry.tableIndex === current.tableIndex + 1
            );
            if (nextRowEntries.length > 0) {
              setFocusedId(nextRowEntries[0].reservationId);
            }
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (focusedId !== null) {
            const current = entries[currentIndex];
            if (current.tableIndex > 0) {
              const prevRowEntries = entries.filter(
                (entry) => entry.tableIndex === current.tableIndex - 1
              );
              if (prevRowEntries.length > 0) {
                setFocusedId(prevRowEntries[prevRowEntries.length - 1].reservationId);
              }
            }
          }
          break;

        case "Enter":
        case " ":
          if (focusedId !== null) {
            onActivate?.(focusedId);
          }
          break;

        case "Escape":
          setFocusedId(null);
          break;
      }
    },
    [entries, focusedId, onActivate]
  );

  return { focusedId, setFocusedId, handleKeyDown };
}

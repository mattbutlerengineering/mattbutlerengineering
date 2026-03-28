import type { HistoryEntry } from "../types.js";
import { relativeTime } from "../utils/relative-time.js";
import styles from "./HistoryPanel.module.css";

export interface HistoryPanelProps {
  entries: HistoryEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Left column showing the prompt history as a scrollable list.
 * Active entry is highlighted with an accent border.
 */
export function HistoryPanel({ entries, activeId, onSelect }: HistoryPanelProps) {
  if (entries.length === 0) {
    return (
      <aside className={styles.panel}>
        <p className={styles.empty}>No history yet</p>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={[styles.item, activeId === entry.id ? styles.itemActive : ""].join(" ")}
              onClick={() => onSelect(entry.id)}
              aria-pressed={activeId === entry.id}
            >
              <span className={styles.itemPrompt}>
                {entry.prompt.length > 60
                  ? `${entry.prompt.slice(0, 60)}\u2026`
                  : entry.prompt}
              </span>
              <span className={styles.itemTime}>{relativeTime(entry.timestamp)}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

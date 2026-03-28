import type { Spec } from "@json-render/react";

export interface HistoryEntry {
  id: string;
  prompt: string;
  spec: Spec;
  rawLines: string[];
  timestamp: Date;
}

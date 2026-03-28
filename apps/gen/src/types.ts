import type { Spec } from "@json-render/react";

export interface HistoryEntry {
  id: string;
  prompt: string;
  spec: Spec;
  rawLines: string[];
  timestamp: Date;
}

export interface StoredSpec {
  id: string;
  userId: string;
  prompt: string;
  spec: unknown;
  rawLines: string[];
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

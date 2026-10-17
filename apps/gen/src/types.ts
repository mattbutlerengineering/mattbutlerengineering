import type { SpecDiff } from "./lib/spec-subtree.js";

export type EntryKind = "generate" | "refine" | "recover" | "failed";

export interface StoredSpec {
  id: string;
  userId: string;
  prompt: string;
  /** Absent on responses from a server that predates the field. */
  kind?: EntryKind;
  spec: unknown;
  rawLines: string[];
  isFavorite: boolean;
  /** Node refinements only: the diff on the parent entry. Null when absent or malformed. */
  refinement?: SpecDiff | null;
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
  updatedAt: string;
}

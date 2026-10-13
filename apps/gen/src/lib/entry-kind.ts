import type { EntryKind, StoredSpec } from "../types.js";

// Entries saved before `kind` existed encoded it as a prompt prefix.
const LEGACY_PREFIXES: ReadonlyArray<readonly [string, EntryKind]> = [
  ["Refined: ", "refine"],
  ["Failed: ", "failed"],
  ["Recovered: ", "recover"],
];

/**
 * The entry's kind and the user's own prompt text, falling back to
 * prefix-sniffing for legacy entries that have no `kind` field.
 */
export function resolveEntry(entry: Pick<StoredSpec, "prompt" | "kind">): {
  kind: EntryKind;
  prompt: string;
} {
  if (entry.kind) return { kind: entry.kind, prompt: entry.prompt };
  for (const [prefix, kind] of LEGACY_PREFIXES) {
    if (entry.prompt.startsWith(prefix)) {
      return { kind, prompt: entry.prompt.slice(prefix.length) };
    }
  }
  return { kind: "generate", prompt: entry.prompt };
}

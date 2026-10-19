/** A copy of `ids` with `id` moved to `toIndex` (clamped); unchanged when `id` is absent. */
export function moveId(ids: readonly string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const rest = ids.filter((other) => other !== id);
  rest.splice(Math.min(Math.max(toIndex, 0), rest.length), 0, id);
  return rest;
}

/** Holidays a Manager said the venue keeps its usual hours on, per venue, on this browser. */
const storageKey = (venueId: string) => `mbe-availability-open-as-usual:${venueId}`;

export function readOpenAsUsual(venueId: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(venueId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    // Storage blocked or garbled: every holiday is offered again, which is harmless.
    return [];
  }
}

export function writeOpenAsUsual(venueId: string, dates: readonly string[]): void {
  try {
    window.localStorage.setItem(storageKey(venueId), JSON.stringify(dates));
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
}

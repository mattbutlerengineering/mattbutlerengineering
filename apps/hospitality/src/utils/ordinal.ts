/** "2nd visit", "3rd visit", "4th visit", etc. */
export function ordinalVisit(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]} visit`;
}

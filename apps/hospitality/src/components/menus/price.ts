const PRICE_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** "12.50" → 1250. Null for anything that is not a non-negative amount with at most two decimals. */
export function parsePriceToCents(text: string): number | null {
  const match = PRICE_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 1250 → "12.50". The inverse of {@link parsePriceToCents}. */
export function formatCentsForInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

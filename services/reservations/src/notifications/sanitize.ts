/**
 * Escapes characters that have special meaning in HTML.
 * Used to prevent HTML/script injection from stored-data values
 * (guest name, venue name, address, etc.) interpolated into email HTML.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns the URL if its scheme is http or https; otherwise returns null.
 * Prevents javascript:, data:, and other dangerous schemes from entering
 * an email's HTML.
 */
export function sanitizeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return raw;
  } catch {
    return null;
  }
}

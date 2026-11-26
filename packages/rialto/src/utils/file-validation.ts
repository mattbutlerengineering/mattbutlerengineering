/** Shared client-side file checks for ImageUpload and FileUpload. */

/** True when `file` satisfies an `accept` string (MIME types, `type/*` wildcards, `.ext`). */
export function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}

/** Human-readable byte size, e.g. `2.0KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

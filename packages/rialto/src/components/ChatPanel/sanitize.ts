const BLOCKED_KEYS = new Set(["dangerouslySetInnerHTML", "ref", "key"]);

export function sanitizeElementProps(props: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (BLOCKED_KEYS.has(key)) continue;
    if (key.startsWith("on") && key.length > 2 && key[2] === key[2]!.toUpperCase()) continue;
    safe[key] = value;
  }
  return safe;
}

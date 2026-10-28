/**
 * Pull complete element objects out of a `render_component` tool-input buffer
 * while the model is still streaming it. Nested objects (props) stay inside
 * the element they belong to; an unfinished trailing object is left for the
 * next delta.
 */
export function completeJsonElements(buffer: string): unknown[] {
  const key = buffer.indexOf('"elements"');
  if (key === -1) return [];
  const start = buffer.indexOf("[", key);
  if (start === -1) return [];

  const elements: unknown[] = [];
  let index = start + 1;
  while (index < buffer.length) {
    const char = buffer[index];
    if (char === undefined) break;
    if (char === " " || char === "\n" || char === "\r" || char === "\t" || char === ",") {
      index += 1;
      continue;
    }
    if (char === "]") break;
    if (char !== "{") break;
    const end = endOfObject(buffer, index);
    if (end === -1) break;
    try {
      elements.push(JSON.parse(buffer.slice(index, end)) as unknown);
    } catch {
      break;
    }
    index = end;
  }
  return elements;
}

function endOfObject(buffer: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char === undefined) break;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

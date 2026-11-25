/**
 * Removes raw component-call text (`ReservationList(items=[…])`) from streamed
 * chat prose (F36). A model that fails to emit a tool call sometimes writes the
 * call as text; the client would show it literally. Streamed deltas split the
 * name and the arguments anywhere, so the scrubber is stateful: it holds back a
 * trailing CamelCase fragment until it can tell whether `(` follows, and once a
 * call starts it drops text up to the matching close paren.
 */

/** At least two capitalised humps then `(`, e.g. `ReservationList(`. */
const CALL_START = /[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\(/;
/**
 * A trailing CamelCase fragment that may still grow into a component name.
 * Plain words ("Hello") are never held, so ordinary text keeps its
 * one-event-per-delta framing; a name split before its second hump still leaks.
 */
/** Any capitalised word then `(`; checked against the catalog names. */
const CAPITALISED_CALL = /(?<![A-Za-z0-9])[A-Z][A-Za-z0-9]*\(/g;
const NAME_TAIL = /[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/;

/** Longest call text held back waiting for its close paren before it is released as prose. */
const MAX_CALL_CHARS = 2000;

export interface ScrubberOptions {
  /** Catalog component names; lets one-hump names such as `Calendar(` match. */
  readonly knownNames?: readonly string[];
}

export interface ComponentCallScrubber {
  push(chunk: string): string;
  /** Step boundary: forget a call cut off mid-step and release any held name fragment. */
  reset(): string;
  flush(): string;
}

export function createComponentCallScrubber(options: ScrubberOptions = {}): ComponentCallScrubber {
  const names = (options.knownNames ?? []).filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n));
  const known = new Set(names);
  const isNamePrefix = (word: string) => names.some((n) => n.startsWith(word));

  let held = "";
  let depth = 0;
  // Text of the call being dropped; released if the call never closes.
  let callText = "";

  const findStart = (rest: string): { index: number; length: number } | null => {
    const generic = CALL_START.exec(rest);
    let first = generic ? { index: generic.index, length: generic[0].length } : null;
    if (known.size > 0) {
      for (const m of rest.matchAll(CAPITALISED_CALL)) {
        if (!known.has(m[0].slice(0, -1))) continue;
        if (!first || m.index < first.index) first = { index: m.index, length: m[0].length };
        break;
      }
    }
    return first;
  };

  const findTail = (rest: string): RegExpExecArray | null => {
    const tail = NAME_TAIL.exec(rest);
    if (tail) return tail;
    const word = /(?<![A-Za-z0-9])[A-Z][a-z0-9]*$/.exec(rest);
    return word && isNamePrefix(word[0]) ? word : null;
  };

  const drain = (input: string, final: boolean): string => {
    let out = "";
    let rest = input;
    while (rest.length > 0) {
      if (depth > 0) {
        let i = 0;
        for (; i < rest.length && depth > 0 && callText.length + i <= MAX_CALL_CHARS; i += 1) {
          if (rest[i] === "(") depth += 1;
          else if (rest[i] === ")") depth -= 1;
        }
        callText += rest.slice(0, i);
        rest = rest.slice(i);
        if (depth > 0 && callText.length > MAX_CALL_CHARS) {
          // Never closed within the window: it was prose, not a call.
          out += callText;
          callText = "";
          depth = 0;
        } else if (depth === 0) {
          callText = "";
        }
        continue;
      }
      const match = findStart(rest);
      if (match) {
        out += rest.slice(0, match.index);
        depth = 1;
        callText = rest.slice(match.index, match.index + match.length);
        rest = rest.slice(match.index + match.length);
        continue;
      }
      const tail = final ? null : findTail(rest);
      if (tail) {
        out += rest.slice(0, tail.index);
        held = tail[0];
      } else {
        out += rest;
      }
      break;
    }
    return out;
  };

  return {
    push(chunk) {
      const input = held + chunk;
      held = "";
      return drain(input, false);
    },
    reset() {
      const input = held;
      held = "";
      depth = 0;
      callText = "";
      return drain(input, true);
    },
    flush() {
      const input = held;
      held = "";
      const out = drain(input, true);
      const unfinished = depth > 0 ? callText : "";
      depth = 0;
      callText = "";
      return out + unfinished;
    },
  };
}

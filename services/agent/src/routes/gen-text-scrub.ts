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
const NAME_TAIL = /[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/;

export interface ComponentCallScrubber {
  push(chunk: string): string;
  flush(): string;
}

export function createComponentCallScrubber(): ComponentCallScrubber {
  let held = "";
  let depth = 0;

  const drain = (input: string, final: boolean): string => {
    let out = "";
    let rest = input;
    while (rest.length > 0) {
      if (depth > 0) {
        let i = 0;
        for (; i < rest.length && depth > 0; i += 1) {
          if (rest[i] === "(") depth += 1;
          else if (rest[i] === ")") depth -= 1;
        }
        rest = rest.slice(i);
        continue;
      }
      const match = CALL_START.exec(rest);
      if (match) {
        out += rest.slice(0, match.index);
        depth = 1;
        rest = rest.slice(match.index + match[0].length);
        continue;
      }
      const tail = final ? null : NAME_TAIL.exec(rest);
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
    flush() {
      const input = held;
      held = "";
      return drain(input, true);
    },
  };
}

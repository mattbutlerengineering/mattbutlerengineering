import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useViewport } from "./useViewport.js";

type ChangeListener = (event: { matches: boolean }) => void;

interface QueryRecord {
  readonly listeners: Set<ChangeListener>;
  added: number;
  removed: number;
}

/** A width-driven `matchMedia` stand-in that understands `(max-width: Npx)` and fires `change`. */
function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const queries = new Map<string, QueryRecord>();
  const evaluate = (query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return max ? width <= Number(max[1]) : false;
  };

  window.matchMedia = vi.fn((query: string) => {
    const record = queries.get(query) ?? {
      listeners: new Set<ChangeListener>(),
      added: 0,
      removed: 0,
    };
    queries.set(query, record);
    return {
      media: query,
      get matches() {
        return evaluate(query);
      },
      addEventListener: (_type: "change", listener: ChangeListener) => {
        record.listeners.add(listener);
        record.added += 1;
      },
      removeEventListener: (_type: "change", listener: ChangeListener) => {
        record.listeners.delete(listener);
        record.removed += 1;
      },
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;

  return {
    queries,
    resize(next: number) {
      width = next;
      for (const [query, record] of queries) {
        for (const listener of record.listeners) listener({ matches: evaluate(query) });
      }
    },
  };
}

describe("useViewport", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it.each([
    [500, "phone"],
    [767, "phone"],
    [768, "tablet"],
    [900, "tablet"],
    [1024, "tablet"],
    [1025, "desktop"],
    [1200, "desktop"],
  ] as const)("reads %i px as %s", (width, expected) => {
    installMatchMedia(width);

    const { result } = renderHook(() => useViewport());

    expect(result.current).toBe(expected);
  });

  it("updates on the change event", () => {
    const media = installMatchMedia(1200);
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe("desktop");

    act(() => media.resize(900));
    expect(result.current).toBe("tablet");

    act(() => media.resize(500));
    expect(result.current).toBe("phone");

    act(() => media.resize(1400));
    expect(result.current).toBe("desktop");
  });

  it("subscribes to both queries and removes every listener on unmount", () => {
    const media = installMatchMedia(900);
    const { unmount } = renderHook(() => useViewport());

    expect([...media.queries.keys()].sort()).toEqual(["(max-width: 1024px)", "(max-width: 767px)"]);
    for (const record of media.queries.values()) expect(record.added).toBeGreaterThan(0);

    unmount();

    for (const record of media.queries.values()) {
      expect(record.removed).toBe(record.added);
      expect(record.listeners.size).toBe(0);
    }
  });
});

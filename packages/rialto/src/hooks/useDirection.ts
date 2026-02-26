import { useState, useEffect, type RefObject } from "react";

type Direction = "ltr" | "rtl";

/**
 * Returns the current text direction ('ltr' | 'rtl') for a given element.
 * Observes `dir` attribute changes on the closest ancestor with `[dir]`,
 * falling back to `document.documentElement`.
 */
export function useDirection(ref: RefObject<HTMLElement | null>): Direction {
  const [dir, setDir] = useState<Direction>("ltr");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const target = el.closest("[dir]") ?? document.documentElement;

    const read = () => {
      const value = getComputedStyle(target).direction;
      setDir(value === "rtl" ? "rtl" : "ltr");
    };

    read();

    const observer = new MutationObserver(read);
    observer.observe(target, { attributes: true, attributeFilter: ["dir"] });

    return () => observer.disconnect();
  }, [ref]);

  return dir;
}

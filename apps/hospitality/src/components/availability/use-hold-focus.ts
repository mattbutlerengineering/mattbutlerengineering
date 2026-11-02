import { useCallback, useEffect, useMemo, useRef, type FocusEvent } from "react";

/** What gets the Manager out of a hold: the failure's Retry, Reload hours, or nothing needed. */
export type HoldWayOut = "banner" | "reload" | null;

/**
 * The way out of a hold unmounts as the hold ends or the reload fails. If focus was on it, focus
 * goes where the Manager is going next and not to the page behind the drawer. If it has moved on,
 * even after a click, it is left alone: a read answering must not take it from a field being typed
 * in. A removed element's blur has no `relatedTarget`, so it does not count as moving on.
 */
export function useHoldFocus(wayOut: HoldWayOut) {
  const editorRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const reloadRef = useRef<HTMLDivElement>(null);
  const hasFocusRef = useRef(false);

  useEffect(() => {
    if (!hasFocusRef.current) return;
    hasFocusRef.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    const landing = wayOut === "banner" ? bannerRef : wayOut === "reload" ? reloadRef : editorRef;
    landing.current?.querySelector("button")?.focus();
  }, [wayOut]);

  // A click counts too: Safari does not focus a button it clicks.
  const claim = useCallback(() => {
    hasFocusRef.current = true;
  }, []);
  const track = useMemo(
    () => ({
      onFocus: claim,
      onClick: claim,
      onBlur: (event: FocusEvent) => {
        if (event.relatedTarget) hasFocusRef.current = false;
      },
    }),
    [claim]
  );

  return { editorRef, bannerRef, reloadRef, track };
}

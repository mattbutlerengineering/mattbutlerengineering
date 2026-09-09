import { useEffect } from "react";

/**
 * Sets `document.title` to the given value whenever it changes. Used by
 * long-lived shells (DashboardLayout) and route-driven pages that need a
 * distinct, per-page title instead of the static default in `index.html`
 * (#4973). Does not restore a previous title on unmount — callers that need
 * that behavior (e.g. LoginGate swapping with the authenticated shell) manage
 * `document.title` directly with their own effect.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

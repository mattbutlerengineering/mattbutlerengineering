import type { ReactNode } from "react";

/**
 * Marks a public guest page (booking, menus, manage, invite). index.css pins html/body to the
 * viewport so the staff shell scrolls internally; guest pages have no such shell, so while one
 * is mounted the document itself must scroll (`html:has([data-guest-surface])` in index.css).
 * `display: contents` keeps the wrapper out of layout.
 */
export function GuestSurface({ children }: { children: ReactNode }) {
  return (
    <div data-guest-surface="" style={{ display: "contents" }}>
      {children}
    </div>
  );
}

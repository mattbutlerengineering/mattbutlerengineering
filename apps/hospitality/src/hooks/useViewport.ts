import { useEffect, useState } from "react";

/**
 * Three-way viewport (architecture § `hooks/useViewport.ts`): the tablet needs its own
 * composition, and two booleans would have drifted. Same shape as `TimelinePage`'s private
 * `useIsMobile` — state initialised from `matchMedia`, updated from `change` events.
 */
export type Viewport = "phone" | "tablet" | "desktop";

const PHONE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(max-width: 1024px)";

function readViewport(): Viewport {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  if (window.matchMedia(PHONE_QUERY).matches) return "phone";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(readViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const lists = [window.matchMedia(PHONE_QUERY), window.matchMedia(TABLET_QUERY)];
    const handleChange = () => setViewport(readViewport());
    for (const list of lists) list.addEventListener("change", handleChange);
    return () => {
      for (const list of lists) list.removeEventListener("change", handleChange);
    };
  }, []);

  return viewport;
}

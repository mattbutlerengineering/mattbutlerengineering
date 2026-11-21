import { createContext, use, useEffect } from "react";

/** The Rialto theme a page wants the shared nav to take, or null for the visitor's own. */
export type PageSky = "light" | "dark" | null;

/**
 * Lets one page lend its light to the app shell. `/venues` goes dark from
 * doors to close; without this the nav above it stays on the visitor's theme
 * and reads as a light bar over a dark room. The default is a no-op, so a page
 * rendered outside the shell (tests, stories) needs no provider.
 */
export const PageSkyContext = createContext<(sky: PageSky) => void>(() => {});

/** Reports `sky` to the shell while the calling page is mounted, and clears it on leaving. */
export function usePageSky(sky: PageSky): void {
  const setPageSky = use(PageSkyContext);
  useEffect(() => {
    setPageSky(sky);
    return () => setPageSky(null);
  }, [setPageSky, sky]);
}

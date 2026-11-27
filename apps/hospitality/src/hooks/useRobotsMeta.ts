import { useEffect } from "react";

export const INDEXABLE_ROBOTS = "index, follow";
export const PRIVATE_ROBOTS = "noindex, nofollow";

/**
 * Sets the `robots` meta tag at runtime. `index.html` ships `index, follow` so
 * the raw HTML of the public showcase landing is crawlable (a runtime-only
 * removal of noindex would come too late); every other route — the dashboard,
 * onboarding and the per-guest pages — calls this with `false` to opt out.
 * Creates the tag if `index.html` has none.
 */
export function useRobotsMeta(indexable: boolean): void {
  useEffect(() => {
    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "robots";
      document.head.appendChild(tag);
    }
    tag.content = indexable ? INDEXABLE_ROBOTS : PRIVATE_ROBOTS;
  }, [indexable]);
}

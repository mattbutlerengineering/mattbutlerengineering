const RELOAD_FLAG = "mbe:preload-reload";

/** A second preload failure this soon after a reload means the asset is really missing. */
const LOOP_WINDOW_MS = 60_000;

/**
 * A deploy replaces hashed chunks, so a tab opened before it can fail to
 * preload a lazy route's CSS/JS. Reload to pick up the new build. The session
 * flag holds the last reload's time: a failure within LOOP_WINDOW_MS of it is a
 * genuinely missing asset, so it throws instead of looping. A later failure is
 * a later deploy and reloads again (#9868).
 */
export function installPreloadErrorReload(
  target: EventTarget = window,
  reload: () => void = () => window.location.reload(),
  now: () => number = Date.now
): void {
  target.addEventListener("vite:preloadError", (event) => {
    const at = now();
    try {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG));
      if (last > 0 && at - last < LOOP_WINDOW_MS) return;
      sessionStorage.setItem(RELOAD_FLAG, String(at));
    } catch {
      return;
    }
    event.preventDefault();
    reload();
  });
}

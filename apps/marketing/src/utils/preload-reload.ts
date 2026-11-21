const RELOAD_FLAG = "mbe:preload-reload";

/**
 * A deploy replaces hashed chunks, so a tab opened before it can fail to
 * preload a lazy route's CSS/JS. Reload once to pick up the new build; the
 * session flag stops a reload loop when the asset is genuinely missing.
 */
export function installPreloadErrorReload(
  target: EventTarget = window,
  reload: () => void = () => window.location.reload()
): void {
  target.addEventListener("vite:preloadError", (event) => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      return;
    }
    event.preventDefault();
    reload();
  });
}

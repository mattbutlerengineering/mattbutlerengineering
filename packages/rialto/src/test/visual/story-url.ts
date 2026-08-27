/**
 * Builds the Storybook preview iframe URL for a given story ID.
 *
 * `embed=true` is load-bearing, not decorative: Storybook's preview resolves
 * `shouldAutoplay = !shouldEmbed(search)`, where `shouldEmbed` checks the
 * `embed` query param. Without it, Storybook re-runs each story's own
 * `play()` function on every load — racing visual.spec.ts's explicit
 * `interact()` helpers, which replicate the *same* action (open a dialog,
 * show a toast) to make the interacted state deterministic for screenshots.
 * When both fire, ConfirmDialog/Dialog/Drawer end up opened twice (the
 * second trigger click is then permanently blocked by the first open's
 * backdrop) and Toast ends up shown twice (breaking the strict-mode
 * `getByText` locator). See #4584.
 */
export function buildStoryUrl(storyId: string): string {
  return `/iframe.html?id=${storyId}&viewMode=story&embed=true`;
}

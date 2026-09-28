/**
 * `infrastructure/worker` (`@mbe/edge-worker`) is plain JavaScript with no
 * `types` entry and no `exports` map, so a deep import of it is implicitly
 * `any` under `strict` (TS7016). This declares the one surface this package
 * touches — the Worker module's `fetch` — rather than turning on `allowJs`,
 * which would drag `edge-router.js`'s attribute-less `routes-config.json`
 * import into the TypeScript program (`resolveJsonModule` under NodeNext) for
 * no benefit.
 *
 * Deliberately minimal: if the Worker's entry contract ever changes, this file
 * is the single place that has to change with it.
 */
declare module "@mbe/edge-worker/edge-router.js" {
  const edgeRouter: {
    fetch(request: Request, env: Record<string, unknown>): Promise<Response>;
  };
  export default edgeRouter;
}

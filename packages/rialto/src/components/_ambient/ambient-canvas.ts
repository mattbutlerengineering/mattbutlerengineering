/** Retina is worth paying for; 3x displays are not. */
export const MAX_DPR = 2;

export interface AmbientSize {
  readonly width: number;
  readonly height: number;
}

/** Pointer position in CSS pixels relative to the canvas. Mutated in place by the runtime. */
export interface AmbientPointer {
  x: number;
  y: number;
}

export interface AmbientFrame<P> extends AmbientSize {
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: P;
  readonly pointer: Readonly<AmbientPointer>;
}

export interface AmbientCanvasOptions<P> {
  /** Resolves the live theme tokens. Called once up front and again whenever `data-theme` flips. */
  readonly readPalette: (canvas: HTMLCanvasElement) => P;
  /** Called after the backing store is resized; (re)build size-dependent state here. */
  readonly onResize: (size: AmbientSize) => void;
  /** Called once per animation frame while the canvas is on screen and the tab is visible. */
  readonly onFrame: (frame: AmbientFrame<P>) => void;
}

/**
 * Starts the generic ambient-canvas loop on `canvas` and returns its teardown.
 *
 * Owns every frame, listener and observer, so one call to the returned function
 * fully releases the component. Returns a no-op when no 2D context is available.
 */
export function startAmbientCanvas<P>(
  canvas: HTMLCanvasElement,
  options: AmbientCanvasOptions<P>
): () => void {
  const ctx = canvas.getContext("2d");
  return ctx ? run(canvas, ctx, options) : () => {};
}

function run<P>(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  { readPalette, onResize, onFrame }: AmbientCanvasOptions<P>
): () => void {
  const pointer: AmbientPointer = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
  };

  let palette = readPalette(canvas);
  let width = 0;
  let height = 0;
  let frameId = 0;
  let onScreen = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize({ width, height });
  }

  function tick() {
    frameId = requestAnimationFrame(tick);
    onFrame({ ctx, palette, pointer, width, height });
  }

  function play() {
    if (!frameId) frameId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  /** Frames are only worth spending while the canvas is both on screen and on top. */
  function syncPlayback() {
    if (onScreen && !document.hidden) play();
    else pause();
  }

  function handlePointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  const intersection = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    syncPlayback();
  });
  intersection.observe(canvas);

  const themeChange = new MutationObserver(() => {
    palette = readPalette(canvas);
  });
  themeChange.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", syncPlayback);

  resize();
  play();

  return () => {
    pause();
    intersection.disconnect();
    themeChange.disconnect();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", syncPlayback);
  };
}

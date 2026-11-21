/** Retina is worth paying for; 3x displays are not. */
const MAX_DPR = 2;

/** Canvas size in CSS pixels, plus the DPR the backing store was scaled by. */
export interface AmbientSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Pointer position in CSS pixels relative to the canvas; infinite until first move. */
export interface AmbientPointer {
  readonly x: number;
  readonly y: number;
}

export interface AmbientFrame<P> extends AmbientSize {
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: P;
  readonly pointer: AmbientPointer;
}

export interface AmbientCanvasHooks<P> {
  /** Called after the backing store is resized (and once on start). */
  readonly onResize: (size: AmbientSize) => void;
  /** Called once per animation frame while the canvas is on screen and visible. */
  readonly onFrame: (frame: AmbientFrame<P>) => void;
  /** Resolves the live theme tokens; re-run whenever `data-theme` flips. */
  readonly readPalette: (canvas: HTMLCanvasElement) => P;
}

/**
 * Starts an ambient canvas loop on `canvas` and returns its teardown.
 *
 * Owns the generic plumbing — DPR-capped resize, rAF play/pause, on-screen and
 * tab-visibility playback sync, theme palette re-read, pointer tracking — so
 * each backdrop supplies only its drawing. Every frame, listener and observer is
 * released by the one returned function.
 */
export function startAmbientCanvas<P>(
  canvas: HTMLCanvasElement,
  hooks: AmbientCanvasHooks<P>
): () => void {
  const ctx = canvas.getContext("2d");
  return ctx ? run(canvas, ctx, hooks) : () => {};
}

function run<P>(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  { onResize, onFrame, readPalette }: AmbientCanvasHooks<P>
): () => void {
  // Private mutable buffers inside the loop closure, never observable from
  // React; copy-on-write per pointer move or frame would be pure churn.
  const pointer = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  const size = { width: 0, height: 0, dpr: 1 };
  let palette = readPalette(canvas);
  let frameId = 0;
  let onScreen = true;

  function resize() {
    size.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    size.width = canvas.clientWidth;
    size.height = canvas.clientHeight;
    canvas.width = Math.round(size.width * size.dpr);
    canvas.height = Math.round(size.height * size.dpr);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    onResize({ ...size });
  }

  function tick() {
    frameId = requestAnimationFrame(tick);
    onFrame({ ...size, ctx, palette, pointer });
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

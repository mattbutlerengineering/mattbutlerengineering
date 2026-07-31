import { useEffect, useRef } from "react";
import { REPO_STATS } from "../../data/repo-stats.js";
import { factorySceneInputs } from "./pipeline-stages.js";
import styles from "./FactorySection.module.css";

/** Start the scene slightly before it is on screen so it is running on arrival. */
const PREFETCH_MARGIN = "200px";

/**
 * The decorative WebGL layer behind the pipeline labels.
 *
 * three.js is never part of the landing route's payload: the scene module is
 * dynamically imported the first time the canvas approaches the viewport, and
 * the returned teardown releases the GL context on unmount. Everything the
 * scene depicts is also present as text in `FactorySection`, so a canvas that
 * never loads costs the reader nothing.
 */
export function FactoryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let stopScene: (() => void) | undefined;
    let unmounted = false;
    let started = false;

    const approaching = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        // One scene per mount, whatever the observer reports afterwards.
        started = true;
        approaching.disconnect();
        void import("./factory-scene.js").then(({ startFactoryScene }) => {
          if (unmounted) return;
          stopScene = startFactoryScene(canvas, factorySceneInputs(REPO_STATS));
        });
      },
      { rootMargin: PREFETCH_MARGIN }
    );
    approaching.observe(canvas);

    return () => {
      unmounted = true;
      approaching.disconnect();
      stopScene?.();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={styles.canvas} />;
}

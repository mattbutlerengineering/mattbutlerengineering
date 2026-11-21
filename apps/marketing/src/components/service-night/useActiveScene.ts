import { useEffect, useState, type RefObject } from "react";
import { SCENES, type SceneId } from "../../data/service-night";

const SCENE_IDS: ReadonlySet<string> = new Set(SCENES.map((scene) => scene.id));

function isSceneId(value: string | null | undefined): value is SceneId {
  return typeof value === "string" && SCENE_IDS.has(value);
}

/**
 * Reports which `[data-scene]` section currently crosses the middle of the
 * viewport. The observer's root margin collapses the viewport to its centre
 * line, so exactly one scene intersects at a time. Starts on the hero, which
 * is also what a visitor without IntersectionObserver keeps.
 */
export function useActiveScene(containerRef: RefObject<HTMLElement | null>): SceneId {
  const [active, setActive] = useState<SceneId>("hero");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const centred = entries.find((entry) => entry.isIntersecting);
        const id = centred?.target.getAttribute("data-scene");
        if (isSceneId(id)) setActive(id);
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    container.querySelectorAll("[data-scene]").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [containerRef]);

  return active;
}

import { useEffect, useRef, useState } from "react";
import type { FloorMaterial } from "@mbe/types";
import { floorTextureUrl } from "../components/floor-plan/floor-textures.js";

/** Loaded floor textures by material. A material absent from the map has no usable texture. */
export type FloorTextureMap = ReadonlyMap<FloorMaterial, HTMLImageElement>;

const EMPTY: FloorTextureMap = new Map();

/**
 * Loads the floor textures a floor plan's sections actually use, by URL from
 * the app's `public/` (never a bundled import — see `floor-textures.ts`).
 *
 * Each texture is published the moment it decodes, so a slow or broken one
 * never holds back the others, and a material that **fails** to load is simply
 * never added: `SectionZone` then paints that section's flat colour, which is
 * exactly how it rendered before materials existed. That degradation is the
 * error handling — the failure is visible as an untextured floor rather than a
 * blank or broken zone, and no retry loop is attempted.
 *
 * Images are requested at most once per material for the life of the component,
 * so re-ordering or re-selecting sections costs nothing.
 */
export function useFloorTextures(materials: readonly FloorMaterial[]): FloorTextureMap {
  // A content key, not the array identity: callers rebuild the list on every
  // render, and the effect must only re-run when the set of materials differs.
  const key = [...new Set(materials)].sort().join(",");
  const [textures, setTextures] = useState<FloorTextureMap>(EMPTY);
  const requestedRef = useRef<Set<FloorMaterial>>(new Set());

  useEffect(() => {
    if (!key) return;
    for (const material of key.split(",") as FloorMaterial[]) {
      if (requestedRef.current.has(material)) continue;
      requestedRef.current.add(material);
      const image = new Image();
      // Deliberately no per-effect-run cancel flag. `requestedRef` dedupes over
      // the component's whole lifetime, so a run that is torn down mid-download
      // is the *only* run that will ever ask for this material — discarding its
      // load would leave the section permanently flat. StrictMode makes that
      // certain rather than rare: `main.tsx` wraps the app, so every dev mount
      // is effect -> cleanup -> effect, and a run-scoped flag means textures
      // never appear in `pnpm dev` at all.
      //
      // A load that lands is the right texture whichever run requested it, and
      // one that lands after unmount is a no-op `setState` on an unmounted
      // component. Both are covered in `useFloorTextures.test.tsx`.
      image.onload = () => {
        // A fresh Map per load: the map already handed to the renderer is never mutated.
        setTextures((previous) => new Map(previous).set(material, image));
      };
      image.src = floorTextureUrl(material, import.meta.env.BASE_URL);
    }
  }, [key]);

  return textures;
}

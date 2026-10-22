import { useState, useEffect } from "react";

// SVG furniture assets
import tableRoundSrc from "../assets/table-round.svg";
import tableSquareSrc from "../assets/table-square.svg";
import tableRectSrc from "../assets/table-rect.svg";
import chairSrc from "../assets/chair.svg";
import barStoolSrc from "../assets/bar-stool.svg";
import boothSrc from "../assets/booth.svg";
import placeSettingSrc from "../assets/place-setting.svg";

// Texture PNGs
import hardwoodSrc from "../textures/hardwood.png";
import concreteSrc from "../textures/concrete.png";
import carpetSrc from "../textures/carpet.png";
import tileSrc from "../textures/tile.png";
import marbleSrc from "../textures/marble.png";

const ASSET_MAP: Record<string, string> = {
  "table-round": tableRoundSrc,
  "table-square": tableSquareSrc,
  "table-rect": tableRectSrc,
  "chair": chairSrc,
  "bar-stool": barStoolSrc,
  "booth": boothSrc,
  "place-setting": placeSettingSrc,
  "hardwood": hardwoodSrc,
  "concrete": concreteSrc,
  "carpet": carpetSrc,
  "tile": tileSrc,
  "marble": marbleSrc,
};

export interface TextureMap {
  readonly [key: string]: HTMLImageElement;
}

export interface UseTexturesResult {
  readonly loaded: boolean;
  readonly textures: TextureMap;
}

export function useTextures(): UseTexturesResult {
  const [loaded, setLoaded] = useState(false);
  const [textures, setTextures] = useState<TextureMap>({});

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(ASSET_MAP);
    const images: Record<string, HTMLImageElement> = {};
    let count = 0;

    for (const [key, src] of entries) {
      const img = new Image();
      img.onload = () => {
        images[key] = img;
        count += 1;
        if (count === entries.length && !cancelled) {
          setTextures(images);
          setLoaded(true);
        }
      };
      img.onerror = () => {
        count += 1;
        if (count === entries.length && !cancelled) {
          setTextures(images);
          setLoaded(true);
        }
      };
      img.src = src;
    }

    return () => { cancelled = true; };
  }, []);

  return { loaded, textures };
}

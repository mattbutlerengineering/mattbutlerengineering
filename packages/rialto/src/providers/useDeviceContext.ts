import { useSyncExternalStore } from "react";

/* ── Types ───────────────────────────────────── */

export interface DeviceContext {
  pointer: "fine" | "coarse";
  viewport: "mobile" | "tablet" | "desktop";
  reducedMotion: boolean;
  colorScheme: "light" | "dark";
  saveData: boolean;
}

/* ── SSR-safe defaults ───────────────────────── */

const SSR_DEFAULTS: DeviceContext = {
  pointer: "fine",
  viewport: "desktop",
  reducedMotion: false,
  colorScheme: "light",
  saveData: false,
};

/* ── Media queries ───────────────────────────── */

interface MediaEntry {
  query: string;
  key: keyof DeviceContext;
  matchValue: DeviceContext[keyof DeviceContext];
  noMatchValue: DeviceContext[keyof DeviceContext];
}

const QUERIES: MediaEntry[] = [
  {
    query: "(pointer: coarse)",
    key: "pointer",
    matchValue: "coarse",
    noMatchValue: "fine",
  },
  {
    query: "(max-width: 479px)",
    key: "viewport",
    matchValue: "mobile",
    noMatchValue: "desktop", // refined below
  },
  {
    query: "(min-width: 480px) and (max-width: 767px)",
    key: "viewport",
    matchValue: "tablet",
    noMatchValue: "desktop", // only matters if neither mobile nor tablet matches
  },
  {
    query: "(prefers-reduced-motion: reduce)",
    key: "reducedMotion",
    matchValue: true,
    noMatchValue: false,
  },
  {
    query: "(prefers-color-scheme: dark)",
    key: "colorScheme",
    matchValue: "dark",
    noMatchValue: "light",
  },
  {
    query: "(prefers-reduced-data: reduce)",
    key: "saveData",
    matchValue: true,
    noMatchValue: false,
  },
];

/* ── Store singleton ─────────────────────────── */

type MqlTuple = [
  MediaQueryList,
  MediaQueryList,
  MediaQueryList,
  MediaQueryList,
  MediaQueryList,
  MediaQueryList,
];

let mqls: MqlTuple | null = null;
let snapshot: DeviceContext = SSR_DEFAULTS;
const listeners = new Set<() => void>();

function getSnapshot(): DeviceContext {
  return snapshot;
}

function getServerSnapshot(): DeviceContext {
  return SSR_DEFAULTS;
}

function computeSnapshot(): DeviceContext {
  if (!mqls) return SSR_DEFAULTS;
  const [mPointer, mMobile, mTablet, mMotion, mScheme, mData] = mqls;

  const pointer = mPointer.matches ? "coarse" : "fine";

  // Viewport: check mobile first, then tablet, else desktop
  let viewport: DeviceContext["viewport"] = "desktop";
  if (mMobile.matches) viewport = "mobile";
  else if (mTablet.matches) viewport = "tablet";

  const reducedMotion = mMotion.matches;
  const colorScheme = mScheme.matches ? "dark" : "light";
  const saveData = mData.matches;

  return { pointer, viewport, reducedMotion, colorScheme, saveData };
}

function handleChange() {
  const next = computeSnapshot();

  // Only update if something actually changed
  if (
    next.pointer !== snapshot.pointer ||
    next.viewport !== snapshot.viewport ||
    next.reducedMotion !== snapshot.reducedMotion ||
    next.colorScheme !== snapshot.colorScheme ||
    next.saveData !== snapshot.saveData
  ) {
    snapshot = next;
    listeners.forEach((cb) => cb());
  }
}

function ensureListeners() {
  if (mqls) return;
  if (typeof window === "undefined") return;

  mqls = QUERIES.map((entry) => window.matchMedia(entry.query)) as MqlTuple;
  snapshot = computeSnapshot();
  mqls.forEach((mql) => mql.addEventListener("change", handleChange));
}

function subscribe(callback: () => void): () => void {
  ensureListeners();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/* ── Hook ────────────────────────────────────── */

/**
 * Detects device environment via `matchMedia` listeners.
 * Returns a stable, memoized {@link DeviceContext} that updates
 * only when media query thresholds cross.
 *
 * Usable standalone (without `<RialtoProvider>`).
 */
export function useDeviceContext(): DeviceContext {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

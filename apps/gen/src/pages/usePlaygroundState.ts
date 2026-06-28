import { useState, useCallback } from "react";

export type PlaygroundMode = "generate" | "refine";

export interface PlaygroundState {
  /** generate (fresh prompt) vs refine (modify the current spec) */
  mode: PlaygroundMode;
  /** distraction-free layout */
  isFullscreen: boolean;
  /** template gallery overlay */
  galleryOpen: boolean;
  /** keyboard-shortcuts help overlay */
  shortcutsOpen: boolean;

  enterRefinement: () => void;
  exitRefinement: () => void;
  /** flip fullscreen; entering/leaving also dismisses open overlays */
  toggleFullscreen: () => void;
  openGallery: () => void;
  closeGallery: () => void;
  toggleGallery: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;
}

/**
 * Owns the PlaygroundPage's non-API UI state — render mode, fullscreen, and the
 * two transient overlays (template gallery, shortcuts help) — plus the named
 * transitions for each. Keeps this state out of the page component and gives it
 * a single, testable owner. Data-fetching/streaming stays in the API hooks.
 */
export function usePlaygroundState(): PlaygroundState {
  const [mode, setMode] = useState<PlaygroundMode>("generate");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const enterRefinement = useCallback(() => setMode("refine"), []);
  const exitRefinement = useCallback(() => setMode("generate"), []);

  const openGallery = useCallback(() => setGalleryOpen(true), []);
  const closeGallery = useCallback(() => setGalleryOpen(false), []);
  const toggleGallery = useCallback(() => setGalleryOpen((prev) => !prev), []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const toggleShortcuts = useCallback(
    () => setShortcutsOpen((prev) => !prev),
    [],
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
    // Overlays don't belong over the fullscreen canvas — dismiss them.
    setGalleryOpen(false);
    setShortcutsOpen(false);
  }, []);

  return {
    mode,
    isFullscreen,
    galleryOpen,
    shortcutsOpen,
    enterRefinement,
    exitRefinement,
    toggleFullscreen,
    openGallery,
    closeGallery,
    toggleGallery,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
  };
}

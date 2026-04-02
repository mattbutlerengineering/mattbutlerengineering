import { useState, useEffect, useCallback, useMemo } from "react";

type Breakpoint = "mobile" | "tablet" | "desktop";

interface PanelState {
  historyVisible: boolean;
  inspectorVisible: boolean;
}

interface PanelLayout extends PanelState {
  breakpoint: Breakpoint;
  toggleHistory: () => void;
  toggleInspector: () => void;
  closeOverlays: () => void;
}

const STORAGE_KEY = "gen-panel-prefs";
const MOBILE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1024px)";

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

function getDefaults(bp: Breakpoint): PanelState {
  switch (bp) {
    case "mobile":
      return { historyVisible: false, inspectorVisible: false };
    case "tablet":
      return { historyVisible: false, inspectorVisible: true };
    case "desktop":
      return { historyVisible: true, inspectorVisible: true };
  }
}

function loadPrefs(bp: Breakpoint): PanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaults(bp);
    const saved = JSON.parse(raw) as Record<string, PanelState>;
    const prefs = saved[bp];
    if (
      prefs &&
      typeof prefs.historyVisible === "boolean" &&
      typeof prefs.inspectorVisible === "boolean"
    ) {
      return prefs;
    }
  } catch {
    // Ignore corrupt data
  }
  return getDefaults(bp);
}

function savePrefs(bp: Breakpoint, state: PanelState): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, PanelState>) : {};
    const updated = { ...existing, [bp]: state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/**
 * Manages panel visibility state across breakpoints with localStorage persistence.
 * Returns current visibility, breakpoint, and toggle functions.
 */
export function usePanelLayout(): PanelLayout {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(getBreakpoint);
  const [panels, setPanels] = useState<PanelState>(() => loadPrefs(getBreakpoint()));

  // Listen for breakpoint changes
  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);

    function handleChange() {
      const newBp = getBreakpoint();
      setBreakpoint((prev) => {
        if (prev === newBp) return prev;
        // Load saved prefs (or defaults) for the new breakpoint
        setPanels(loadPrefs(newBp));
        return newBp;
      });
    }

    mobileQuery.addEventListener("change", handleChange);
    tabletQuery.addEventListener("change", handleChange);

    return () => {
      mobileQuery.removeEventListener("change", handleChange);
      tabletQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Persist on change
  useEffect(() => {
    savePrefs(breakpoint, panels);
  }, [breakpoint, panels]);

  const toggleHistory = useCallback(() => {
    setPanels((prev) => ({ ...prev, historyVisible: !prev.historyVisible }));
  }, []);

  const toggleInspector = useCallback(() => {
    setPanels((prev) => ({ ...prev, inspectorVisible: !prev.inspectorVisible }));
  }, []);

  const closeOverlays = useCallback(() => {
    setPanels((prev) => {
      if (breakpoint === "desktop") return prev;
      return { ...prev, historyVisible: false, inspectorVisible: false };
    });
  }, [breakpoint]);

  return useMemo(
    () => ({
      ...panels,
      breakpoint,
      toggleHistory,
      toggleInspector,
      closeOverlays,
    }),
    [panels, breakpoint, toggleHistory, toggleInspector, closeOverlays]
  );
}

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import {
  AppBar,
  ThemeToggle,
  Avatar,
  Button,
  Shortcut,
  CommandPalette,
  Text,
} from "@mattbutlerengineering/rialto";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import { useAuth } from "@mbe/auth/react";
import { useTheme } from "../contexts/ThemeContext.js";
import { usePanelLayout } from "../hooks/usePanelLayout.js";
import { shortcutKeys } from "../lib/shortcuts.js";
import { HelpButton } from "./KeyboardShortcuts.js";
import styles from "./AppShell.module.css";

type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * State exposed by the shell to the page body. The shell owns panel
 * visibility (history / inspector) and the command-palette open flag; pages
 * read this through {@link useAppShellPanels} instead of threading callbacks
 * and paired flags through props.
 *
 * Note: `isFullscreen` is intentionally absent — it is owned solely by
 * `usePlaygroundState` and passed to AppShell as a prop. Pages read it
 * directly from the hook, not from the shell context.
 */
interface AppShellPanels {
  historyVisible: boolean;
  inspectorVisible: boolean;
  breakpoint: Breakpoint;
  toggleHistory: () => void;
  toggleInspector: () => void;
  closeOverlays: () => void;
  openPalette: () => void;
  closePalette: () => void;
}

interface AppShellContextValue extends AppShellPanels {
  /** Passed in as a prop from usePlaygroundState; stored here so internal
   * compound children (HistoryRegion, InspectorRegion) can suppress panels in
   * fullscreen without needing prop threading. Not re-exported via
   * useAppShellPanels — ownership stays with usePlaygroundState. */
  isFullscreen: boolean;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

function useAppShellContext(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("AppShell compound components must be used within <AppShell>");
  }
  return ctx;
}

/**
 * Read the shell-owned panel state from inside an {@link AppShell}.
 * Use this in the page body to drive responsive layout classes and
 * overlay-dismissal behaviour without re-deriving panel state.
 */
export function useAppShellPanels(): AppShellPanels {
  const {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
    openPalette,
    closePalette,
  } = useAppShellContext();
  return {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
    openPalette,
    closePalette,
  };
}

export interface AppShellProps {
  children: ReactNode;
  /** Genuinely per-page: how to sign the user out. Defaults to auth signOut. */
  onSignOut?: () => void;
  /** Genuinely per-page: clicking the logo returns to the empty state. */
  onLogoClick?: () => void;
  /** Genuinely per-page: open the templates gallery. Omit to hide the button. */
  onTemplatesOpen?: () => void;
  /** Genuinely per-page: open the keyboard-shortcuts dialog. Omit to hide the button. */
  onShortcutsOpen?: () => void;
  /** Genuinely per-page: fullscreen suppresses the side panels. */
  isFullscreen?: boolean;
}

interface RegionProps {
  children: ReactNode;
}

/**
 * Top-level layout shell. Owns panel toggle state (history / inspector) and
 * the command-palette open flag internally via {@link usePanelLayout}, exposing
 * them through context. Compose {@link AppShell.HistoryRegion},
 * {@link AppShell.InspectorRegion}, and {@link AppShell.CommandPalette} as
 * children instead of wiring callbacks and paired visibility flags.
 */
export function AppShell({
  children,
  onSignOut,
  onLogoClick,
  onTemplatesOpen,
  onShortcutsOpen,
  isFullscreen = false,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const {
    historyVisible,
    inspectorVisible,
    breakpoint,
    toggleHistory,
    toggleInspector,
    closeOverlays,
  } = usePanelLayout();
  const [paletteOpen, setPaletteOpen] = useState(false);

  function handleSignOut() {
    if (onSignOut) {
      onSignOut();
    } else {
      void signOut();
    }
  }

  const contextValue = useMemo<AppShellContextValue>(
    () => ({
      historyVisible,
      inspectorVisible,
      breakpoint,
      isFullscreen,
      toggleHistory,
      toggleInspector,
      closeOverlays,
      openPalette: () => setPaletteOpen(true),
      closePalette: () => setPaletteOpen(false),
      paletteOpen,
      setPaletteOpen,
    }),
    [
      historyVisible,
      inspectorVisible,
      breakpoint,
      isFullscreen,
      toggleHistory,
      toggleInspector,
      closeOverlays,
      paletteOpen,
    ]
  );

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className={styles.shell}>
        <a href="#main-content" className={styles.skipLink}>
          Skip to main content
        </a>
        <AppBar
          logo={
            <div className={styles.logoGroup}>
              <Button
                type="button"
                className={`${styles.panelToggle} ${historyVisible ? styles.panelToggleActive : ""}`}
                onClick={toggleHistory}
                aria-label="Toggle history panel"
                aria-pressed={historyVisible}
              >
                <Text aria-hidden="true">&#9776;</Text>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={styles.logoButton}
                onClick={onLogoClick}
                aria-label="Return to empty state"
              >
                <Text className={styles.logoAccent} aria-hidden="true">
                  &#9670;
                </Text>
                <Text className={styles.logoText}>Gen Playground</Text>
              </Button>
              <Shortcut keys={shortcutKeys("palette")} className={styles.shortcutHint} />
            </div>
          }
          actions={
            <div className={styles.actions}>
              {onTemplatesOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.headerGhost}
                  onClick={onTemplatesOpen}
                >
                  Templates
                </Button>
              )}
              <Button
                type="button"
                className={`${styles.panelToggle} ${inspectorVisible ? styles.panelToggleActive : ""}`}
                onClick={toggleInspector}
                aria-label="Toggle JSON inspector"
                aria-pressed={inspectorVisible}
              >
                <Text aria-hidden="true">{"{}"}</Text>
              </Button>
              {onShortcutsOpen && <HelpButton onClick={onShortcutsOpen} />}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {user && (
                <Avatar
                  src={user.picture}
                  name={user.name ?? user.email ?? "User"}
                  size="sm"
                  className={styles.avatar}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className={styles.headerGhost}
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </div>
          }
        />
        <div id="main-content" className={styles.content}>
          {children}
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

/**
 * Wraps the history panel. Renders nothing when history is hidden or the page
 * is fullscreen. Applies the responsive side-panel / overlay chrome and an
 * overlay backdrop on mobile/tablet.
 */
function HistoryRegion({ children }: RegionProps) {
  const { historyVisible, isFullscreen, breakpoint, closeOverlays } = useAppShellContext();
  if (isFullscreen || !historyVisible) return null;
  if (breakpoint === "desktop") {
    return <div className={styles.sidePanel}>{children}</div>;
  }
  return (
    <OverlayPanel label="History" onClose={closeOverlays} placement="start">
      {children}
    </OverlayPanel>
  );
}

/**
 * Wraps the JSON inspector panel. Renders nothing when the inspector is hidden
 * or the page is fullscreen. Applies the responsive side-panel / overlay chrome
 * and an overlay backdrop on mobile/tablet.
 */
function InspectorRegion({ children }: RegionProps) {
  const { inspectorVisible, isFullscreen, breakpoint, closeOverlays } = useAppShellContext();
  if (isFullscreen || !inspectorVisible) return null;
  if (breakpoint === "desktop") {
    return <div className={styles.sidePanel}>{children}</div>;
  }
  return (
    <OverlayPanel label="JSON inspector" onClose={closeOverlays} placement="end">
      {children}
    </OverlayPanel>
  );
}

const TABBABLE_SELECTOR = [
  'button:not(:disabled):not([tabindex="-1"])',
  '[href]:not([tabindex="-1"])',
  'input:not(:disabled):not([type="hidden"]):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Shell overlays, most recently mounted last. Only the top one owns Tab and Escape. */
const shellOverlayStack: HTMLElement[] = [];

function tabbables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (el) => !el.closest("[hidden], [inert]")
  );
}

/** A dialog that is not one of these shell overlays (gallery, shortcuts, palette). */
function otherModalOpen(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']")
  ).some((el) => el.dataset.shellOverlay === undefined);
}

/**
 * Remembers the element focused when the overlay mounted (the panel toggle,
 * when it was used to open) and puts focus back there when the overlay unmounts.
 */
function useRestoreTriggerFocus(): void {
  const triggerRef = useRef<HTMLElement | null>(null);
  // Stays true across StrictMode's setup → cleanup → setup replay. The replay's
  // cleanup schedules a restore rAF; that rAF must not yank focus back while the
  // overlay is still open. A real unmount leaves this false.
  const openRef = useRef(false);
  useLayoutEffect(() => {
    openRef.current = true;
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const trigger = triggerRef.current;
      triggerRef.current = null;
      openRef.current = false;
      requestAnimationFrame(() => {
        if (openRef.current) return;
        trigger?.focus();
      });
    };
  }, []);
}

/**
 * While this overlay is the top shell layer, Escape dismisses it and Tab stays
 * inside it. A dialog opened above the shell (template gallery, shortcuts)
 * keeps the key. preventDefault lets the global Escape→stop shortcut stand down.
 */
function useOverlayKeyControls(
  panelRef: RefObject<HTMLDivElement | null>,
  onClose: () => void
): void {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    shellOverlayStack.push(panel);
    const isTop = () => shellOverlayStack[shellOverlayStack.length - 1] === panel;

    if (isTop() && !otherModalOpen()) {
      tabbables(panel)[0]?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop() || otherModalOpen()) return;
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = tabbables(panel);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = shellOverlayStack.lastIndexOf(panel);
      if (index !== -1) shellOverlayStack.splice(index, 1);
    };
  }, [onClose, panelRef]);
}

interface OverlayPanelProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
  placement: "start" | "end";
}

/**
 * Mobile/tablet presentation of a side panel: a dimmed backdrop plus a dialog
 * that owns focus until dismissed. Desktop keeps the in-flow side panel.
 */
function OverlayPanel({ children, label, onClose, placement }: OverlayPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useRestoreTriggerFocus();
  useOverlayKeyControls(panelRef, onClose);
  const placementClass = placement === "start" ? styles.overlayStart : styles.overlayEnd;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`${styles.overlayPanel} ${placementClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-shell-overlay=""
      >
        {children}
      </div>
    </>
  );
}

interface ShellCommandPaletteProps {
  items: CommandItem[];
}

/**
 * Command palette wired to the shell-owned open state. Open it with
 * {@link useAppShellPanels}'s `openPalette`.
 */
function ShellCommandPalette({ items }: ShellCommandPaletteProps) {
  const { paletteOpen, setPaletteOpen } = useAppShellContext();
  return (
    <CommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      items={items}
      groups={["Actions", "Panels", "Settings"]}
      placeholder="Search commands..."
    />
  );
}

AppShell.HistoryRegion = HistoryRegion;
AppShell.InspectorRegion = InspectorRegion;
AppShell.CommandPalette = ShellCommandPalette;

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import styles from "./AppShell.module.css";

type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * State exposed by the shell to the page body. The shell owns panel
 * visibility (history / inspector) and the command-palette open flag; pages
 * read this through {@link useAppShellPanels} instead of threading callbacks
 * and paired flags through props.
 */
interface AppShellPanels {
  historyVisible: boolean;
  inspectorVisible: boolean;
  breakpoint: Breakpoint;
  isFullscreen: boolean;
  toggleHistory: () => void;
  toggleInspector: () => void;
  closeOverlays: () => void;
  openPalette: () => void;
  closePalette: () => void;
}

interface AppShellContextValue extends AppShellPanels {
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
    isFullscreen,
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
    isFullscreen,
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
                className={styles.logoButton}
                onClick={onLogoClick}
                aria-label="Return to empty state"
              >
                <Text className={styles.logoAccent} aria-hidden="true">
                  &#9670;
                </Text>
                <Text className={styles.logoText}>Gen Playground</Text>
              </Button>
              <Shortcut keys={["⌘", "K"]} className={styles.shortcutHint} />
            </div>
          }
          actions={
            <div className={styles.actions}>
              {onTemplatesOpen && (
                <Button variant="ghost" size="sm" onClick={onTemplatesOpen}>
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
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              {user && (
                <Avatar src={user.picture} name={user.name ?? user.email ?? "User"} size="sm" />
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
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
  const isOverlay = breakpoint !== "desktop";
  return (
    <>
      {isOverlay && <div className={styles.backdrop} onClick={closeOverlays} aria-hidden="true" />}
      <div
        className={isOverlay ? `${styles.overlayPanel} ${styles.overlayStart}` : styles.sidePanel}
      >
        {children}
      </div>
    </>
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
  const isOverlay = breakpoint !== "desktop";
  return (
    <>
      {isOverlay && <div className={styles.backdrop} onClick={closeOverlays} aria-hidden="true" />}
      <div className={isOverlay ? `${styles.overlayPanel} ${styles.overlayEnd}` : styles.sidePanel}>
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

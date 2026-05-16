import type { ReactNode } from "react";
import { AppBar, ThemeToggle, Avatar, Button, Shortcut, CommandPalette } from "@mattbutlerengineering/rialto";
import type { CommandItem } from "@mattbutlerengineering/rialto";
import { useAuth } from "@mbe/auth/react";
import { useTheme } from "../contexts/ThemeContext.js";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: ReactNode;
  onSignOut?: () => void;
  historyVisible?: boolean;
  inspectorVisible?: boolean;
  onToggleHistory?: () => void;
  onToggleInspector?: () => void;
  onLogoClick?: () => void;
  onTemplatesOpen?: () => void;
  paletteOpen?: boolean;
  onPaletteOpenChange?: (open: boolean) => void;
  commandItems?: CommandItem[];
}

/**
 * Top-level layout shell with AppBar (panel toggles, theme toggle, user avatar, logout)
 * and a content area below.
 */
export function AppShell({
  children,
  onSignOut,
  historyVisible = true,
  inspectorVisible = true,
  onToggleHistory,
  onToggleInspector,
  onLogoClick,
  onTemplatesOpen,
  paletteOpen,
  onPaletteOpenChange,
  commandItems,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();

  function handleSignOut() {
    if (onSignOut) {
      onSignOut();
    } else {
      void signOut();
    }
  }

  return (
    <div className={styles.shell}>
      <AppBar
        logo={
          <div className={styles.logoGroup}>
            {onToggleHistory && (
              <button
                type="button"
                className={`${styles.panelToggle} ${historyVisible ? styles.panelToggleActive : ""}`}
                onClick={onToggleHistory}
                aria-label="Toggle history panel"
                aria-pressed={historyVisible}
              >
                <span aria-hidden="true">&#9776;</span>
              </button>
            )}
            <button
              type="button"
              className={styles.logoButton}
              onClick={onLogoClick}
              aria-label="Return to empty state"
            >
              <span className={styles.logoAccent} aria-hidden="true">
                &#9670;
              </span>
              <span className={styles.logoText}>Gen Playground</span>
            </button>
            <Shortcut keys={["\u2318", "K"]} className={styles.shortcutHint} />
          </div>
        }
        actions={
          <div className={styles.actions}>
            {onTemplatesOpen && (
              <Button variant="ghost" size="sm" onClick={onTemplatesOpen}>
                Templates
              </Button>
            )}
            {onToggleInspector && (
              <button
                type="button"
                className={`${styles.panelToggle} ${inspectorVisible ? styles.panelToggleActive : ""}`}
                onClick={onToggleInspector}
                aria-label="Toggle JSON inspector"
                aria-pressed={inspectorVisible}
              >
                <span aria-hidden="true">{"{}"}</span>
              </button>
            )}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {user && (
              <Avatar
                src={user.picture}
                name={user.name ?? user.email ?? "User"}
                size="sm"
              />
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        }
      />
      <div className={styles.content}>{children}</div>
      {paletteOpen !== undefined && onPaletteOpenChange && commandItems && (
        <CommandPalette
          open={paletteOpen}
          onOpenChange={onPaletteOpenChange}
          items={commandItems}
          groups={["Actions", "Panels", "Settings"]}
          placeholder="Search commands..."
        />
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { AppBar, ThemeToggle, Avatar, Button } from "@mbe/rialto";
import { useAuth } from "@mbe/auth/react";
import { useTheme } from "../contexts/ThemeContext.js";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  children: ReactNode;
  onSignOut?: () => void;
}

/**
 * Top-level layout shell with AppBar (theme toggle, user avatar, logout)
 * and a content area below.
 */
export function AppShell({ children, onSignOut }: AppShellProps) {
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
        logo={<span className={styles.logoText}>Gen Playground</span>}
        actions={
          <div className={styles.actions}>
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
    </div>
  );
}

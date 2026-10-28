import type { ReactNode } from "react";
import { Footer, GlobalNav, Text, useTheme } from "@mattbutlerengineering/rialto";
import styles from "./SiteChrome.module.css";

/**
 * The shared mattbutlerengineering.com header (brand link home) and footer
 * around a page body, for Gen's signed-out and auth-failure screens.
 */
export function SiteChrome({ children }: { readonly children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={styles.page}>
      <GlobalNav currentApp="gen" theme={theme} onThemeToggle={toggleTheme} />
      <div className={styles.body}>{children}</div>
      <Footer variant="minimal">
        <Text>{`© ${new Date().getFullYear()} Matt Butler Engineering`}</Text>
      </Footer>
    </div>
  );
}

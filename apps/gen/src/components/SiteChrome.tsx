import type { ReactNode } from "react";
import { Footer, GlobalNav, Text, useTheme } from "@mattbutlerengineering/rialto";
import { globalNavProps, siteCopyright, siteFooterColumns } from "@mbe/site-nav";
import styles from "./SiteChrome.module.css";

/**
 * The shared mattbutlerengineering.com header (brand link home, Engineering menu)
 * and footer (project and contact links) around a page body — the body's
 * `<main>` must carry `id="main-content"` for the skip link — for Gen's
 * signed-out and auth-failure screens.
 */
export function SiteChrome({ children }: { readonly children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className={styles.page}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      <GlobalNav
        currentApp="gen"
        theme={theme}
        onThemeToggle={toggleTheme}
        {...globalNavProps("/gen/")}
      />
      <div className={styles.body}>{children}</div>
      <Footer
        variant="rich"
        logo={<Text>MBE</Text>}
        columns={siteFooterColumns()}
        copyright={siteCopyright(new Date().getFullYear())}
      />
    </div>
  );
}

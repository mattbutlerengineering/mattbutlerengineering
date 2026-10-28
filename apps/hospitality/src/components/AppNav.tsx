import { useTranslation } from "react-i18next";
import { GlobalNav, ThemeToggle } from "@mattbutlerengineering/rialto";
import { homeUrl, type HostConfig } from "../lib/host-brand.js";
import styles from "./AppNav.module.css";

interface AppNavProps {
  readonly host: HostConfig;
  readonly theme: "light" | "dark";
  readonly onThemeToggle: () => void;
}

/**
 * Top bar for the host serving the app (#7709). On mattbutlerengineering.com
 * the app is one part of the larger site, so it gets the cross-site GlobalNav.
 * A standalone host (eat-sheet.com) serves only this app: it gets a brand bar
 * whose wordmark links to the host root, and no links to sibling apps that
 * host does not serve.
 */
export function AppNav({ host, theme, onThemeToggle }: AppNavProps) {
  const { t } = useTranslation();

  if (!host.standalone) {
    return (
      <GlobalNav
        currentApp="hospitality"
        theme={theme}
        onThemeToggle={onThemeToggle}
        labels={{
          marketing: t("shell.globalNav.marketing"),
          hospitality: t("shell.globalNav.hospitality"),
          rialto: t("shell.globalNav.rialto"),
        }}
      />
    );
  }

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <a href={homeUrl()} className={styles.brand}>
          {host.brand.logo}
        </a>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>
    </header>
  );
}

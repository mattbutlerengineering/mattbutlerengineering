import { Toggle } from "@mbe/rialto";
import styles from "./Navbar.module.css";

interface NavbarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  return (
    <header className={styles.navbar}>
      <div className={styles.inner}>
        <span className={styles.brand}>Matt Butler</span>
        <Toggle
          label={theme === "dark" ? "☀" : "☽"}
          checked={theme === "dark"}
          onCheckedChange={onThemeToggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        />
      </div>
    </header>
  );
}

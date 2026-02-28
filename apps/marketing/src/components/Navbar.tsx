import { Button } from "@mbe/rialto";
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onThemeToggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "☀" : "☽"}
        </Button>
      </div>
    </header>
  );
}

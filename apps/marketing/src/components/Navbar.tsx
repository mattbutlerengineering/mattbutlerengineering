import { Toggle, AppBar } from "@mbe/rialto";

interface NavbarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  return (
    <AppBar
      logo={<span>Matt Butler</span>}
      actions={
        <Toggle
          label={theme === "dark" ? "☀" : "☽"}
          checked={theme === "dark"}
          onCheckedChange={onThemeToggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        />
      }
    />
  );
}

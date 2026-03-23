import { AppBar, ThemeToggle } from "@mbe/rialto";

interface NavbarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  return (
    <AppBar
      logo={<span>Matt Butler</span>}
      actions={<ThemeToggle theme={theme} onToggle={onThemeToggle} />}
    />
  );
}

import { AppBar, ThemeToggle, Text } from "@mattbutlerengineering/rialto";

interface NavbarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

export function Navbar({ theme, onThemeToggle }: NavbarProps) {
  return (
    <AppBar
      logo={<Text>Matt Butler</Text>}
      actions={<ThemeToggle theme={theme} onToggle={onThemeToggle} />}
    />
  );
}

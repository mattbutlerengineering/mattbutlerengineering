import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeContext, useThemeContext } from "./ThemeContext.js";

function TestComponent() {
  const { theme, preference, toggleTheme, setTheme } = useThemeContext();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="preference">{preference}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
    </div>
  );
}

describe("ThemeContext", () => {
  it("provides full theme surface via context", () => {
    const handleToggle = vi.fn();
    const handleSet = vi.fn();
    render(
      <ThemeContext
        value={{
          preference: "system",
          theme: "dark",
          toggleTheme: handleToggle,
          setTheme: handleSet,
        }}
      >
        <TestComponent />
      </ThemeContext>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    fireEvent.click(screen.getByText("Toggle"));
    expect(handleToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Set Dark"));
    expect(handleSet).toHaveBeenCalledWith("dark");
  });

  it("provides default light theme when used outside provider", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });
});

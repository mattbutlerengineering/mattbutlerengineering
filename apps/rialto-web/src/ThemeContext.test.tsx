import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeContext, useThemeContext } from "./ThemeContext.js";
import React from "react";

function TestComponent() {
  const { theme, onThemeToggle } = useThemeContext();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={onThemeToggle}>Toggle</button>
    </div>
  );
}

describe("ThemeContext", () => {
  it("provides theme context", () => {
    const handleToggle = vi.fn();
    render(
      <ThemeContext.Provider value={{ theme: "dark", onThemeToggle: handleToggle }}>
        <TestComponent />
      </ThemeContext.Provider>
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    fireEvent.click(screen.getByText("Toggle"));
    expect(handleToggle).toHaveBeenCalled();
  });

  it("provides default light theme", () => {
    render(<TestComponent />);
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });
});

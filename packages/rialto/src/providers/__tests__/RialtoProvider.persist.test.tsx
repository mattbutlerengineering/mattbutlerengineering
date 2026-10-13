import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoProvider } from "../RialtoProvider";
import { useTheme } from "../useTheme";
import { THEME_STORAGE_KEY } from "../../hooks/useThemeState";
import { stubMatchMedia, setMatchingMedia } from "../../test/match-media";

const DARK = "(prefers-color-scheme: dark)";

function Consumer() {
  const { preference, theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{theme}</span>
      <button onClick={() => setTheme("dark")}>go dark</button>
    </div>
  );
}

describe("RialtoProvider persistTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    stubMatchMedia([]);
  });

  it("updates data-theme when the OS flips and 'system' is stored", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    const { container } = render(
      <RialtoProvider persistTheme>
        <Consumer />
      </RialtoProvider>
    );
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");

    act(() => setMatchingMedia([DARK]));

    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
  });

  it("persists a preference set through the context", async () => {
    const { container } = render(
      <RialtoProvider persistTheme>
        <Consumer />
      </RialtoProvider>
    );
    await userEvent.click(screen.getByText("go dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    render(
      <RialtoProvider persistTheme>
        <Consumer />
      </RialtoProvider>
    );
    expect(screen.getByTestId("pref")).toHaveTextContent("system");
  });
});

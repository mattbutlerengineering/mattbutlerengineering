import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoverCardPage } from "./HoverCardPage";

describe("HoverCardPage contrast", () => {
  it("does not use --rialto-accent as a text colour (3.15:1 on surface in light theme)", () => {
    render(<HoverCardPage />);
    const trigger = screen.getAllByText("Charles Leclerc")[0] as HTMLElement;
    expect(trigger.style.color).not.toBe("var(--rialto-accent)");
  });
});

describe("HoverCardPage keyboard", () => {
  it("tabs to the profile and lap-time triggers and opens each card on focus", async () => {
    const user = userEvent.setup();
    render(<HoverCardPage />);

    const profile = screen.getAllByText("Charles Leclerc")[0]!;
    const lap = screen.getByText("1:25.410");
    const top = screen.getByRole("button", { name: "Top placement" });
    expect(profile.tabIndex).toBe(0);
    expect(lap.tabIndex).toBe(0);

    profile.focus();
    expect(profile).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await user.tab();
    expect(top).toHaveFocus();

    lap.focus();
    await waitFor(() => expect(screen.getByText("Lap 14 — Sector Breakdown")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Lap 14 — Sector Breakdown")).not.toBeInTheDocument()
    );
    expect(lap).toHaveFocus();
  });
});

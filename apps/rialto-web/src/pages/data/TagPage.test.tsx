import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPage } from "./TagPage";

function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const root = heading.parentElement;
  if (!root) throw new Error(`missing section ${title}`);
  return root;
}

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => null,
}));

describe("TagPage usage example", () => {
  beforeEach(() => {
    // Exit animation is instant under reduced motion, so the tag unmounts
    // instead of lingering in AnimatePresence.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("removes a circuit when its dismiss button is clicked", async () => {
    const user = userEvent.setup();
    render(<TagPage />);

    const usage = screen.getByText("Active circuits").parentElement;
    if (!usage) throw new Error("Active circuits usage example not found");

    expect(within(usage).getByText("Fiorano")).toBeInTheDocument();
    expect(within(usage).getByText("Monza")).toBeInTheDocument();

    await user.click(within(usage).getByRole("button", { name: "Remove Fiorano" }));

    await waitFor(() => {
      expect(
        within(usage).queryByRole("button", { name: "Remove Fiorano" })
      ).not.toBeInTheDocument();
    });
    expect(within(usage).queryByText("Fiorano")).not.toBeInTheDocument();
    expect(within(usage).getByText("Monza")).toBeInTheDocument();
    expect(within(usage).getByText("Mugello")).toBeInTheDocument();
  });

  it("removes every dismissible tag when each one is clicked before the exit finishes", async () => {
    render(<TagPage />);
    const dismissible = section("Dismissible (AnimatedTag)");

    for (const name of ["Fiorano", "Monza", "Mugello", "Imola", "Spa"]) {
      fireEvent.click(within(dismissible).getByRole("button", { name: `Remove ${name}` }));
    }

    expect(within(dismissible).getByRole("button", { name: "Reset tags" })).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dismissible).queryAllByRole("button", { name: /Remove / })).toHaveLength(0);
    });
    expect(screen.getByRole("button", { name: "Remove Fiorano" })).toBeInTheDocument();
  });

  it("exposes aria-pressed on selectable filter tags", async () => {
    const user = userEvent.setup();
    render(<TagPage />);
    const filters = section("Selectable (Filter Mode)");
    const v6 = within(filters).getByRole("button", { name: "V6" });
    const v8 = within(filters).getByRole("button", { name: "V8" });

    expect(v6).toHaveAttribute("aria-pressed", "true");
    expect(v8).toHaveAttribute("aria-pressed", "false");

    await user.click(v8);
    expect(v8).toHaveAttribute("aria-pressed", "true");
    expect(v6).toHaveAttribute("aria-pressed", "true");

    v8.focus();
    await user.keyboard(" ");
    expect(v8).toHaveAttribute("aria-pressed", "false");
  });
});

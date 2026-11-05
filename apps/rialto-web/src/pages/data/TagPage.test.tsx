import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagPage } from "./TagPage";

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
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputPage } from "./InputPage";

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => null,
}));

describe("InputPage read-only state", () => {
  it("renders Read-only as a focusable readonly field, distinct from Disabled", async () => {
    const user = userEvent.setup();
    render(<InputPage />);

    const readOnly = screen.getByRole("textbox", { name: "Read-only" });
    expect(readOnly).toHaveValue("SF-24");
    expect(readOnly).toHaveAttribute("readonly");
    expect(readOnly).not.toBeDisabled();

    await user.click(readOnly);
    expect(readOnly).toHaveFocus();

    const disabled = screen.getByRole("textbox", { name: "Disabled" });
    expect(disabled).toBeDisabled();
    expect(disabled).not.toHaveAttribute("readonly");
  });
});

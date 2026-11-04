import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControlPage } from "./SegmentedControlPage";

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => null,
}));

describe("SegmentedControlPage usage example", () => {
  it("moves the lap analysis selection and swaps the view content", async () => {
    const user = userEvent.setup();
    render(<SegmentedControlPage />);

    expect(screen.getByText("Chart view content")).toBeInTheDocument();

    const data = screen.getByRole("radio", { name: "Data" });
    data.focus();
    await user.keyboard(" ");

    expect(data).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Data view content")).toBeInTheDocument();
    expect(screen.queryByText("Chart view content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Compare" }));

    expect(screen.getByRole("radio", { name: "Compare" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Compare view content")).toBeInTheDocument();
    expect(screen.queryByText("Data view content")).not.toBeInTheDocument();
  });
});

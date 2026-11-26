import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagsInput } from "./TagsInput";

describe("TagsInput", () => {
  it("commits typed text as a tag on Enter and clears the input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TagsInput label="Dietary" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Dietary");
    await user.type(input, "vegan{Enter}");
    expect(screen.getByRole("listitem")).toHaveTextContent("vegan");
    expect(input).toHaveValue("");
    expect(onValueChange).toHaveBeenCalledWith(["vegan"]);
  });

  it("commits on comma and ignores empty input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TagsInput label="Dietary" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Dietary");
    await user.type(input, "   {Enter}");
    expect(onValueChange).not.toHaveBeenCalled();
    await user.type(input, "halal,");
    expect(onValueChange).toHaveBeenCalledWith(["halal"]);
  });

  it("rejects case-insensitive duplicates unless allowDuplicates", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TagsInput label="T" defaultValue={["Vegan"]} />);
    await user.type(screen.getByLabelText("T"), "vegan{Enter}");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("vegan");
    rerender(<TagsInput label="T" defaultValue={["Vegan"]} allowDuplicates />);
    await user.type(screen.getByLabelText("T"), "vegan{Enter}");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("stops at maxTags and marks the input aria-disabled", async () => {
    const user = userEvent.setup();
    render(<TagsInput label="T" maxTags={1} defaultValue={["a"]} />);
    const input = screen.getByLabelText("T");
    expect(input).toHaveAttribute("aria-disabled", "true");
    await user.type(input, "b{Enter}");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("commits each piece of a pasted comma list", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TagsInput label="T" onValueChange={onValueChange} />);
    await user.click(screen.getByLabelText("T"));
    await user.paste("a, b, c");
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
  });

  it("removes the last tag on Backspace in an empty input", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TagsInput label="T" defaultValue={["a", "b"]} onValueChange={onValueChange} />);
    await user.click(screen.getByLabelText("T"));
    await user.keyboard("{Backspace}");
    expect(onValueChange).toHaveBeenCalledWith(["a"]);
  });

  it("removes via the chip button and returns focus to the input", async () => {
    const user = userEvent.setup();
    render(<TagsInput label="T" defaultValue={["a", "b"]} />);
    await user.click(screen.getByRole("button", { name: "Remove a" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("T")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("a");
  });

  it("works controlled", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [v, setV] = useState<string[]>([]);
      return <TagsInput label="T" value={v} onValueChange={setV} />;
    }
    render(<Wrapper />);
    await user.type(screen.getByLabelText("T"), "x{Enter}");
    expect(screen.getByRole("listitem")).toHaveTextContent("x");
  });

  it("links error text and sets aria-invalid", () => {
    render(<TagsInput label="T" error hint="Too many" />);
    const input = screen.getByLabelText("T");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Too many")).toHaveAttribute(
      "id",
      input.getAttribute("aria-describedby")!
    );
  });

  it("gives error and hint spans distinct keys so role=alert lands on a fresh node", () => {
    const { rerender } = render(<TagsInput label="T" hint="Help" />);
    const hintNode = screen.getByText("Help");
    rerender(<TagsInput label="T" error hint="Bad" />);
    const errorNode = screen.getByText("Bad");
    expect(errorNode).not.toBe(hintNode);
    expect(errorNode).toHaveAttribute("role", "alert");
  });

  it("re-announces an identical repeated announcement", async () => {
    const user = userEvent.setup();
    render(<TagsInput label="T" defaultValue={["Vegan"]} />);
    const status = screen.getByRole("status");
    await user.type(screen.getByLabelText("T"), "vegan{Enter}");
    const first = status.textContent;
    await user.type(screen.getByLabelText("T"), "vegan{Enter}");
    expect(status.textContent?.trim()).toBe(first?.trim());
    expect(status.textContent).not.toBe(first);
  });

  it("keeps later chips mounted when an earlier one is removed", async () => {
    const user = userEvent.setup();
    render(<TagsInput label="T" defaultValue={["a", "b", "c"]} />);
    const c = screen.getByText("c").closest("li");
    await user.click(screen.getByRole("button", { name: "Remove a" }));
    expect(screen.getByText("c").closest("li")).toBe(c);
  });
});

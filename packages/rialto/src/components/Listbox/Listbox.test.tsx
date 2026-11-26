import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Listbox } from "./Listbox";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo", disabled: true },
  { value: "c", label: "Charlie" },
  { value: "d", label: "Delta" },
];

function renderListbox(props: Partial<React.ComponentProps<typeof Listbox>> = {}) {
  return render(<Listbox aria-label="Letters" options={OPTIONS} {...props} />);
}

function activeLabel(): string | null {
  const listbox = screen.getByRole("listbox");
  const id = listbox.getAttribute("aria-activedescendant");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

describe("Listbox", () => {
  it("ArrowDown skips disabled options, moves aria-activedescendant and selects", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderListbox({ onValueChange });
    await user.tab();
    expect(activeLabel()).toBe("Alpha");
    await user.keyboard("{ArrowDown}");
    expect(activeLabel()).toBe("Charlie");
    await user.keyboard("{ArrowDown}");
    expect(activeLabel()).toBe("Delta");
    expect(onValueChange).toHaveBeenLastCalledWith("d");
    await user.keyboard("{ArrowDown}");
    expect(activeLabel()).toBe("Delta");
  });

  it("is one tab stop with option semantics and unique ids", () => {
    renderListbox({ multiple: true, defaultValue: ["c"] });
    const listbox = screen.getByRole("listbox", { name: "Letters" });
    expect(listbox).toHaveAttribute("tabindex", "0");
    expect(listbox).toHaveAttribute("aria-multiselectable", "true");
    const options = screen.getAllByRole("option");
    expect(new Set(options.map((o) => o.id)).size).toBe(4);
    expect(options[1]).toHaveAttribute("aria-disabled", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("Home/End jump to first/last enabled option", async () => {
    const user = userEvent.setup();
    renderListbox();
    await user.tab();
    await user.keyboard("{End}");
    expect(activeLabel()).toBe("Delta");
    await user.keyboard("{Home}");
    expect(activeLabel()).toBe("Alpha");
  });

  it("type-ahead moves to the next option starting with the typed text", async () => {
    const user = userEvent.setup();
    renderListbox();
    await user.tab();
    await user.keyboard("d");
    expect(activeLabel()).toBe("Delta");
  });

  it("multiple: Space toggles, Shift+Arrow extends, Ctrl+A selects all enabled", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderListbox({ multiple: true, onValueChange });
    await user.tab();
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenLastCalledWith(["a"]);
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "c"]);
    await user.keyboard("{Control>}a{/Control}");
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "c", "d"]);
    await user.keyboard(" ");
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "d"]);
  });

  it("clicking selects (toggles when multiple); disabled options ignore clicks", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = renderListbox({ onValueChange });
    await user.click(screen.getByRole("option", { name: "Bravo" }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Charlie" }));
    expect(onValueChange).toHaveBeenLastCalledWith("c");
    rerender(
      <Listbox aria-label="Letters" options={OPTIONS} multiple onValueChange={onValueChange} />
    );
    await user.click(screen.getByRole("option", { name: "Delta" }));
    expect(onValueChange).toHaveBeenLastCalledWith(["c", "d"]);
    await user.click(screen.getByRole("option", { name: "Delta" }));
    expect(onValueChange).toHaveBeenLastCalledWith(["c"]);
  });

  it("on focus activates the first selected option", async () => {
    const user = userEvent.setup();
    renderListbox({ defaultValue: "d" });
    await user.tab();
    expect(activeLabel()).toBe("Delta");
  });

  it("names itself via aria-labelledby when given", () => {
    render(
      <>
        <span id="lbl">Pick</span>
        <Listbox aria-labelledby="lbl" options={OPTIONS} />
      </>
    );
    expect(screen.getByRole("listbox", { name: "Pick" })).toBeInTheDocument();
  });

  it("renders a localized empty message with no options", () => {
    renderListbox({ options: [] });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });
});

/**
 * Unit tests for the Combobox component.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Combobox } from "./Combobox";

const user = userEvent.setup();

// jsdom does not implement scrollIntoView
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const options = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

const withDisabled = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot", disabled: true },
  { value: "banana", label: "Banana" },
];

describe("Combobox — rendering & ARIA", () => {
  it("renders an input labelled by the label prop", () => {
    render(<Combobox label="Fruit" options={options} />);
    expect(screen.getByLabelText("Fruit")).toBeInTheDocument();
  });

  it("exposes combobox role and listbox wiring on the input", () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-controls");
  });

  it("does not render a listbox by default", () => {
    render(<Combobox label="Fruit" options={options} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders a hint when provided", () => {
    render(<Combobox label="Fruit" options={options} hint="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("renders required indicator when required", () => {
    render(<Combobox label="Fruit" options={options} required />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders optional indicator when showOptional is true", () => {
    render(<Combobox label="Fruit" options={options} showOptional />);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("sets aria-invalid when error is true", () => {
    render(<Combobox label="Fruit" options={options} error />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the input when disabled", () => {
    render(<Combobox label="Fruit" options={options} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("does not emit 'undefined' in the wrapper className", () => {
    const { container } = render(<Combobox label="Fruit" options={options} />);
    expect(container.querySelector('[class*="undefined"]')).toBeNull();
  });
});

describe("Combobox — opening & filtering", () => {
  it("opens the listbox on focus", async () => {
    render(<Combobox label="Fruit" options={options} />);
    screen.getByRole("combobox").focus();
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on ArrowDown when closed", async () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("filters options by a case-insensitive label substring", async () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "ap");
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Apricot")).toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("does not filter internally when filter=false (async mode)", async () => {
    render(<Combobox label="Fruit" options={options} filter={false} onInputChange={vi.fn()} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "zzz");
    expect(screen.getAllByRole("option")).toHaveLength(options.length);
  });

  it("calls onInputChange as the query changes", async () => {
    const onInputChange = vi.fn();
    render(<Combobox label="Fruit" options={options} onInputChange={onInputChange} />);
    await user.type(screen.getByRole("combobox"), "ba");
    expect(onInputChange).toHaveBeenCalledWith("b");
    expect(onInputChange).toHaveBeenCalledWith("ba");
  });
});

describe("Combobox — single select", () => {
  it("selecting an option fires onChange with its value", async () => {
    const onChange = vi.fn();
    render(<Combobox label="Fruit" options={options} onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Banana"));
    expect(onChange).toHaveBeenCalledWith("banana");
  });

  it("fills the input with the selected label and closes", async () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.click(await screen.findByText("Cherry"));
    expect(input).toHaveValue("Cherry");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("marks the selected option aria-selected", async () => {
    render(<Combobox label="Fruit" options={options} value="banana" />);
    await user.click(screen.getByRole("combobox"));
    const banana = screen.getAllByRole("option").find((el) => within(el).queryByText("Banana"));
    expect(banana).toHaveAttribute("aria-selected", "true");
  });

  it("controlled value renders the selected label in the input", () => {
    render(<Combobox label="Fruit" options={options} value="apple" />);
    expect(screen.getByRole("combobox")).toHaveValue("Apple");
  });

  it("keyboard: ArrowDown then Enter selects the focused option", async () => {
    const onChange = vi.fn();
    render(<Combobox label="Fruit" options={options} onChange={onChange} />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("apple");
  });

  it("keyboard: ArrowDown/ArrowUp moves the active option", async () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    input.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-1"));
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-0"));
  });

  it("keyboard: Escape closes the listbox", async () => {
    render(<Combobox label="Fruit" options={options} />);
    const input = screen.getByRole("combobox");
    input.focus();
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("skips disabled options during keyboard navigation", async () => {
    render(<Combobox label="Fruit" options={withDisabled} />);
    const input = screen.getByRole("combobox");
    input.focus();
    // index 0 (Apple) → skip disabled index 1 (Apricot) → index 2 (Banana)
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-2"));
  });

  it("does not select a disabled option on click", async () => {
    const onChange = vi.fn();
    render(<Combobox label="Fruit" options={withDisabled} onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Apricot"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when clicking outside", async () => {
    render(
      <div>
        <Combobox label="Fruit" options={options} />
        <button>outside</button>
      </div>
    );
    screen.getByRole("combobox").focus();
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    await user.click(screen.getByText("outside"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});

describe("Combobox — multi select", () => {
  it("marks the listbox multiselectable", async () => {
    render(<Combobox label="Fruit" options={options} multiple />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
  });

  it("renders removable chips for selected values", () => {
    render(<Combobox label="Fruit" options={options} multiple values={["apple", "banana"]} />);
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Apple" })).toBeInTheDocument();
  });

  it("selecting an option adds it and keeps the listbox open", async () => {
    const onValuesChange = vi.fn();
    render(<Combobox label="Fruit" options={options} multiple onValuesChange={onValuesChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Apple"));
    expect(onValuesChange).toHaveBeenCalledWith(["apple"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("selecting an already-selected option removes it", async () => {
    const onValuesChange = vi.fn();
    render(
      <Combobox
        label="Fruit"
        options={options}
        multiple
        values={["apple"]}
        onValuesChange={onValuesChange}
      />
    );
    await user.click(screen.getByRole("combobox"));
    const appleOption = screen.getAllByRole("option").find((el) => within(el).queryByText("Apple"));
    await user.click(appleOption!);
    expect(onValuesChange).toHaveBeenCalledWith([]);
  });

  it("clicking a chip's remove button removes that value", async () => {
    const onValuesChange = vi.fn();
    render(
      <Combobox
        label="Fruit"
        options={options}
        multiple
        values={["apple", "banana"]}
        onValuesChange={onValuesChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Remove Apple" }));
    expect(onValuesChange).toHaveBeenCalledWith(["banana"]);
  });

  it("Backspace on an empty query removes the last chip", async () => {
    const onValuesChange = vi.fn();
    render(
      <Combobox
        label="Fruit"
        options={options}
        multiple
        values={["apple", "banana"]}
        onValuesChange={onValuesChange}
      />
    );
    screen.getByRole("combobox").focus();
    await user.keyboard("{Backspace}");
    expect(onValuesChange).toHaveBeenCalledWith(["apple"]);
  });

  it("marks selected options aria-selected in the listbox", async () => {
    render(<Combobox label="Fruit" options={options} multiple values={["banana"]} />);
    await user.click(screen.getByRole("combobox"));
    const banana = screen.getAllByRole("option").find((el) => within(el).queryByText("Banana"));
    expect(banana).toHaveAttribute("aria-selected", "true");
  });
});

describe("Combobox — async loading & empty states", () => {
  it("shows the loading text while loading", async () => {
    render(<Combobox label="Fruit" options={[]} loading loadingText="Fetching…" />);
    screen.getByRole("combobox").focus();
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Fetching…")).toBeInTheDocument();
  });

  it("announces loading via the live region", async () => {
    render(<Combobox label="Fruit" options={[]} loading loadingText="Fetching…" />);
    screen.getByRole("combobox").focus();
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Fetching…"));
  });

  it("shows the empty text when no options match", async () => {
    render(<Combobox label="Fruit" options={options} emptyText="No fruit" />);
    await user.type(screen.getByRole("combobox"), "zzz");
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("No fruit")).toBeInTheDocument();
  });

  it("announces the result count via the live region", async () => {
    render(<Combobox label="Fruit" options={options} />);
    screen.getByRole("combobox").focus();
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("4 results available"));
  });

  it("announces the empty state via the live region", async () => {
    render(<Combobox label="Fruit" options={options} emptyText="No fruit" />);
    await user.type(screen.getByRole("combobox"), "zzz");
    const status = screen.getByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("No fruit"));
  });
});

describe("Combobox — aria-live announcements", () => {
  // role="alert" on a freshly-mounted node is spec-reliable for insertion-
  // with-content, unlike role="status"/aria-live="polite" on a conditionally
  // mounted region (which can be born with content before AT registers it
  // as live). See #4833 / #4841 / #4842.
  it("announces the error hint via an alert region", () => {
    render(<Combobox label="Fruit" options={options} error hint="Selection required" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Selection required");
  });

  it("does not render an alert region for the plain (non-error) hint", () => {
    render(<Combobox label="Fruit" options={options} hint="Pick one" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mounts a fresh alert node rather than mutating the hint node's role when error flips true", () => {
    const { rerender } = render(
      <Combobox label="Fruit" options={options} hint="Selection required" />
    );
    const hintNode = screen.getByText("Selection required");
    rerender(<Combobox label="Fruit" options={options} error hint="Selection required" />);
    const alertNode = screen.getByRole("alert");
    // A genuine DOM insertion (distinct keys) yields a new node identity;
    // an attribute-toggled `role` on the same pre-existing node (the shape
    // #4841/#4842 removed) would keep the same node reference here.
    expect(alertNode).not.toBe(hintNode);
  });

  it("does not duplicate the error message into a separate hidden node", () => {
    render(<Combobox label="Fruit" options={options} error hint="Selection required" />);
    expect(screen.getAllByText("Selection required")).toHaveLength(1);
  });
});

describe("Combobox — accessibility (axe)", () => {
  it("has no violations when closed", async () => {
    const { container } = render(<Combobox label="Fruit" options={options} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations when open with options", async () => {
    const { container } = render(<Combobox label="Fruit" options={options} />);
    screen.getByRole("combobox").focus();
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations in multi mode with chips", async () => {
    const { container } = render(
      <Combobox label="Fruit" options={options} multiple values={["apple", "banana"]} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no violations while loading", async () => {
    const { container } = render(<Combobox label="Fruit" options={[]} loading />);
    screen.getByRole("combobox").focus();
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
  });
});

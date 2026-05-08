/**
 * Unit tests for the Autocomplete component.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Autocomplete } from "./Autocomplete";

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

describe("Autocomplete", () => {
  it("renders input with label", () => {
    render(<Autocomplete label="Fruit" options={options} />);
    expect(screen.getByLabelText("Fruit")).toBeInTheDocument();
  });

  it("does not show dropdown by default", () => {
    render(<Autocomplete label="Fruit" options={options} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows options when typing a matching character", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "a");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // "Apple", "Apricot", and "Banana" contain "a"
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Apricot")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });

  it("filters options based on input", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "ban");
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("shows emptyText when no options match", async () => {
    render(<Autocomplete label="Fruit" options={options} emptyText="No fruits found" />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "xyz");
    expect(screen.getByText("No fruits found")).toBeInTheDocument();
  });

  it("calls onSelect when an option is clicked", async () => {
    const onSelect = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onSelect={onSelect} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    const appleOption = await screen.findByText("Apple");
    await user.click(appleOption);
    expect(onSelect).toHaveBeenCalledWith({ value: "apple", label: "Apple" });
  });

  it("sets input value to selected option label after selection", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    const appleOption = await screen.findByText("Apple");
    await user.click(appleOption);
    expect(input).toHaveValue("Apple");
  });

  it("closes dropdown after selection", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    const appleOption = await screen.findByText("Apple");
    await user.click(appleOption);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("calls onChange when input value changes", async () => {
    const onChange = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onChange={onChange} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "ba");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(onChange).toHaveBeenCalledWith("ba");
  });

  it("keyboard: ArrowDown opens dropdown", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    input.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keyboard: ArrowDown navigates to first option", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "a");
    await user.keyboard("{ArrowDown}");
    // First option (Apple) should be active
    await waitFor(() => {
      const firstOption = screen.getByText("Apple").closest("[role='option']");
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });
  });

  it("keyboard: ArrowDown/ArrowUp navigates options", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "a");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      const firstOption = screen.getByText("Apple").closest("[role='option']");
      expect(firstOption).toHaveAttribute("aria-selected", "true");
    });
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      const secondOption = screen.getByText("Apricot").closest("[role='option']");
      expect(secondOption).toHaveAttribute("aria-selected", "true");
    });
  });

  it("keyboard: Enter selects active option", async () => {
    const onSelect = vi.fn();
    render(<Autocomplete label="Fruit" options={options} onSelect={onSelect} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      const option = screen.getByText("Apple").closest("[role='option']");
      expect(option).toHaveAttribute("aria-selected", "true");
    });
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ value: "apple", label: "Apple" });
  });

  it("keyboard: Escape closes dropdown", async () => {
    render(<Autocomplete label="Fruit" options={options} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes dropdown when clicking outside", async () => {
    render(
      <div>
        <Autocomplete label="Fruit" options={options} />
        <p>Outside</p>
      </div>
    );
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "app");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByText("Outside"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("renders hint text when provided", () => {
    render(<Autocomplete label="Fruit" options={options} hint="Start typing to search" />);
    expect(screen.getByText("Start typing to search")).toBeInTheDocument();
  });

  it("renders optional indicator when showOptional is true", () => {
    render(<Autocomplete label="Fruit" options={options} showOptional />);
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it("renders required indicator when required", () => {
    render(<Autocomplete label="Fruit" options={options} required />);
    // The "*" required span is inside the label element
    const labelEl = document.querySelector("label");
    expect(labelEl).toHaveTextContent("*");
  });

  it("has combobox role on input", () => {
    render(<Autocomplete label="Fruit" options={options} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("controlled: respects value prop", () => {
    render(<Autocomplete label="Fruit" options={options} value="Banana" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Fruit")).toHaveValue("Banana");
  });

  it("ArrowUp wraps from first to last option", async () => {
    const twoOptions = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    render(<Autocomplete label="Fruit" options={twoOptions} />);
    const input = screen.getByLabelText("Fruit");
    await user.type(input, "a");
    await user.keyboard("{ArrowDown}");
    // active = 0 (Alpha)
    await waitFor(() => {
      const opt = screen.getByText("Alpha").closest("[role='option']");
      expect(opt).toHaveAttribute("aria-selected", "true");
    });
    // ArrowUp wraps to last (Beta)
    await user.keyboard("{ArrowUp}");
    await waitFor(() => {
      const lastOpt = screen.getByText("Beta").closest("[role='option']");
      expect(lastOpt).toHaveAttribute("aria-selected", "true");
    });
  });

  it("shows listbox when input is focused with existing value", async () => {
    render(<Autocomplete label="Fruit" options={options} value="App" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Fruit");
    input.focus();
    // onFocus triggers setIsOpen(true) when inputValue is truthy
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });
});

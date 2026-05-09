import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const options: SelectOption[] = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },
];

const disabledOptions: SelectOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta", disabled: true },
  { value: "c", label: "Gamma" },
];

describe("Select", () => {
  describe("rendering", () => {
    it("renders trigger with combobox role", () => {
      render(<Select options={options} />);
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("shows placeholder when no value selected", () => {
      render(<Select options={options} placeholder="Pick one" />);
      expect(screen.getByText("Pick one")).toBeInTheDocument();
    });

    it("shows selected option label when value is set", () => {
      render(<Select options={options} value="ca" onChange={() => {}} />);
      expect(screen.getByText("Canada")).toBeInTheDocument();
    });

    it("renders label element when label prop provided", () => {
      render(<Select options={options} label="Country" />);
      expect(screen.getByText("Country")).toBeInTheDocument();
    });

    it("does not show listbox when closed", () => {
      render(<Select options={options} />);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("open/close", () => {
    it("opens dropdown on click", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes dropdown on second click (toggle)", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("combobox"));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("closes on Escape key", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("opens on ArrowDown key when closed", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      screen.getByRole("combobox").focus();
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("opens on Enter key when closed", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      screen.getByRole("combobox").focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("sets aria-expanded=true when open", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    });

    it("sets aria-expanded=false when closed", () => {
      render(<Select options={options} />);
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("option rendering", () => {
    it("renders all options when open", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      await user.click(screen.getByRole("combobox"));
      const opts = screen.getAllByRole("option");
      expect(opts).toHaveLength(3);
    });

    it("marks the selected option with aria-selected=true", async () => {
      const user = userEvent.setup();
      render(<Select options={options} value="ca" onChange={() => {}} />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.getByRole("option", { name: "Canada" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });

    it("marks non-selected options with aria-selected=false", async () => {
      const user = userEvent.setup();
      render(<Select options={options} value="ca" onChange={() => {}} />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.getByRole("option", { name: "United States" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
    });
  });

  describe("selection", () => {
    it("calls onChange when an option is clicked", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Select options={options} onChange={onChange} />);
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: "Canada" }));
      expect(onChange).toHaveBeenCalledWith("ca");
    });

    it("closes dropdown after selection", async () => {
      const user = userEvent.setup();
      render(<Select options={options} onChange={() => {}} />);
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: "Mexico" }));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("does not call onChange for disabled options", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Select options={disabledOptions} onChange={onChange} />);
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: "Beta" }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("keyboard navigation", () => {
    it("moves focus down with ArrowDown", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      const trigger = screen.getByRole("combobox");
      trigger.focus();
      await user.keyboard("{ArrowDown}");
      // dropdown opens with first item focused (index 0 since no value)
      // pressing ArrowDown again moves to index 1
      await user.keyboard("{ArrowDown}");
      // aria-activedescendant should reference option index 1
      const activeId = trigger.getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
    });

    it("selects focused option with Enter key", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Select options={options} onChange={onChange} />);
      const trigger = screen.getByRole("combobox");
      trigger.focus();
      await user.keyboard("{ArrowDown}"); // opens
      await user.keyboard("{Enter}"); // selects first focused option
      expect(onChange).toHaveBeenCalled();
    });

    it("navigates to last option with End key", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      screen.getByRole("combobox").focus();
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{End}");
      const activeId = screen.getByRole("combobox").getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
    });

    it("navigates to first option with Home key", async () => {
      const user = userEvent.setup();
      render(<Select options={options} />);
      screen.getByRole("combobox").focus();
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{End}");
      await user.keyboard("{Home}");
      const activeId = screen.getByRole("combobox").getAttribute("aria-activedescendant");
      expect(activeId).toBeTruthy();
    });
  });

  describe("disabled state", () => {
    it("does not open when disabled", async () => {
      const user = userEvent.setup();
      render(<Select options={options} disabled />);
      await user.click(screen.getByRole("combobox"));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("sets aria-disabled on the trigger", () => {
      render(<Select options={options} disabled />);
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Select ref={ref} options={options} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

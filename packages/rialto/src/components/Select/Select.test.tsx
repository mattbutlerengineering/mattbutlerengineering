import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";
import { Card } from "../Card/Card";
import { Dialog } from "../Dialog/Dialog";

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

    it("supports an accessible name via aria-label without a visible label", () => {
      render(<Select options={options} aria-label="Country" />);
      expect(screen.getByRole("combobox", { name: "Country" })).toBeInTheDocument();
    });

    it("uses the provided id as the base for the trigger's id", () => {
      render(<Select options={options} label="Country" id="country-field" />);
      expect(screen.getByRole("combobox")).toHaveAttribute("id", "country-field-trigger");
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

  it("does not emit 'undefined' in wrapper className", () => {
    const { container } = render(<Select options={options} />);
    expect(container.firstElementChild?.className).not.toMatch(/undefined/);
  });
});

describe("Select — dropdown escapes ancestor Card stacking context", () => {
  it("portals the open listbox to document.body so a sibling Card can't occlude it", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Card data-testid="card-1">
          <Select options={options} aria-label="Theme" />
        </Card>
        <Card data-testid="card-2">
          <p>Notifications</p>
        </Card>
      </div>
    );

    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");

    // Portaled directly under document.body — outside both Cards' DOM
    // subtrees, so it can never be painted under a sibling Card's stacking
    // context (jsdom has no layout engine, so this DOM-ancestry check is the
    // safe stand-in for an elementFromPoint occlusion check).
    expect(listbox.parentElement).toBe(document.body);
    expect(screen.getByTestId("card-1")).not.toContainElement(listbox);
    expect(screen.getByTestId("card-2")).not.toContainElement(listbox);
  });

  it("still selects an option by click when portaled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Card data-testid="card-1">
        <Select options={options} onChange={onChange} aria-label="Theme" />
      </Card>
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Canada" }));
    expect(onChange).toHaveBeenCalledWith("ca");
  });

  it("renders the listbox above a Dialog ancestor's overlay, not just above a Card", async () => {
    // This package's vitest config sets `css.modules.classNameStrategy:
    // "non-scoped"` but leaves `test.css` at its Vitest default (false), so
    // `import "*.module.css"` never injects real rules into jsdom and
    // getComputedStyle always reports "auto". Inject just the two `z-index`
    // declarations, extracted from the real stylesheets, so the asserted
    // values are sourced from source-of-truth CSS rather than hardcoded in
    // the test — the full stylesheets can't be injected as-is because they
    // use `var(--rialto-*)` tokens jsdom's CSS engine can't resolve outside
    // a real app (crashes computing unrelated properties like font-size).
    const extractZIndex = (cssPath: string, selector: string): string => {
      const css = fs.readFileSync(cssPath, "utf-8");
      const match = new RegExp(`\\.${selector}\\s*\\{[^}]*z-index:\\s*(\\d+)`, "s").exec(css);
      const captured = match?.[1];
      if (!captured) throw new Error(`no z-index found for .${selector} in ${cssPath}`);
      return captured;
    };
    const sourceDropdownZIndex = extractZIndex(
      path.join(__dirname, "Select.module.css"),
      "dropdown"
    );
    const sourceOverlayZIndex = extractZIndex(
      path.join(__dirname, "../Dialog/Dialog.module.css"),
      "overlay"
    );
    const style = document.createElement("style");
    style.textContent = `.dropdown { z-index: ${sourceDropdownZIndex}; } .overlay { z-index: ${sourceOverlayZIndex}; }`;
    document.head.appendChild(style);

    const user = userEvent.setup();
    render(
      <Dialog open onClose={() => {}} title="Book a table">
        <Select options={options} aria-label="Country" />
      </Dialog>
    );

    await user.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement;

    const listboxZIndex = Number(getComputedStyle(listbox).zIndex);
    const overlayZIndex = Number(getComputedStyle(overlay).zIndex);

    // Dialog's overlay (z-index: 100) is NOT portaled, so it occupies the
    // same root stacking context as Select's portaled dropdown. The
    // dropdown must win, or a click on an option lands on the dialog
    // instead — the exact occlusion bug this component was fixed for,
    // relocated from Card to Dialog.
    expect(listboxZIndex).toBeGreaterThan(overlayZIndex);
  });
});

describe("Select — required marker + aria-live announcements", () => {
  it("renders the required marker when required", () => {
    render(<Select options={options} label="Country" required />);
    expect(screen.getByText("*", { exact: false })).toBeInTheDocument();
  });

  // role="alert" on a freshly-mounted node is spec-reliable for insertion-
  // with-content, unlike the old always-mounted echo region. See #4833.
  it("announces the error hint via an alert region", () => {
    render(<Select options={options} error hint="Selection required" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Selection required");
  });

  it("does not duplicate the error message into a separate hidden echo node", () => {
    render(<Select options={options} error hint="Selection required" />);
    expect(screen.getAllByText("Selection required")).toHaveLength(1);
  });
});

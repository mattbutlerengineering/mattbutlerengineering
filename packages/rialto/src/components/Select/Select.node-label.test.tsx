import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const endonyms: SelectOption[] = [
  {
    value: "en",
    label: (
      <span lang="en" data-testid="en-label">
        English
      </span>
    ),
    textValue: "English",
  },
  {
    value: "fr",
    label: (
      <span lang="fr-CA" data-testid="fr-label">
        Français
      </span>
    ),
    textValue: "Français",
  },
  { value: "it", label: "Italiano" },
];

describe("Select ReactNode option labels", () => {
  it("renders a node label in the listbox with its lang attribute", async () => {
    const user = userEvent.setup();
    render(<Select options={endonyms} aria-label="Language" />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByTestId("fr-label")).toHaveAttribute("lang", "fr-CA");
    expect(screen.getByRole("option", { name: "Français" })).toBeInTheDocument();
  });

  it("renders the selected node label in the trigger", () => {
    render(<Select options={endonyms} value="fr" onChange={() => {}} aria-label="Language" />);
    expect(screen.getByTestId("fr-label")).toBeInTheDocument();
  });

  it("type-ahead matches textValue when the label is a node", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={endonyms} onChange={onChange} aria-label="Language" />);
    screen.getByRole("combobox").focus();
    await user.keyboard("f");
    expect(onChange).toHaveBeenCalledWith("fr");
  });

  it("type-ahead still matches plain string labels", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select options={endonyms} onChange={onChange} aria-label="Language" />);
    screen.getByRole("combobox").focus();
    await user.keyboard("i");
    expect(onChange).toHaveBeenCalledWith("it");
  });

  it("a node label with no textValue is skipped by type-ahead without throwing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={[{ value: "x", label: <b>Xylophone</b> }]}
        onChange={onChange}
        aria-label="Instrument"
      />
    );
    screen.getByRole("combobox").focus();
    await user.keyboard("x");
    expect(onChange).not.toHaveBeenCalled();
  });
});

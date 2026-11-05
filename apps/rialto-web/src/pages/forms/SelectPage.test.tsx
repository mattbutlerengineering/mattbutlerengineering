import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectPage } from "./SelectPage";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // Exit animations never finish in jsdom. Reduced motion makes the listbox
  // leave immediately, which is what the combobox assertions wait on.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function combobox(name: string): HTMLElement {
  return screen.getByRole("combobox", { name });
}

describe("SelectPage selections", () => {
  it("shows Medium (C3) on the Tyre Compound trigger after a click", async () => {
    const user = userEvent.setup();
    render(<SelectPage />);

    await user.click(combobox("Tyre Compound"));
    await user.click(screen.getByRole("option", { name: "Medium (C3)" }));

    expect(combobox("Tyre Compound")).toHaveTextContent("Medium (C3)");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows Medium (C3) on the Tyre Compound trigger after ArrowDown and Enter", async () => {
    const user = userEvent.setup();
    render(<SelectPage />);

    const trigger = combobox("Tyre Compound");
    trigger.focus();
    // First ArrowDown opens on Soft (C5); the next moves to Medium (C3).
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(trigger).toHaveTextContent("Medium (C3)");
  });

  it("keeps the Driving Mode select updating", async () => {
    const user = userEvent.setup();
    render(<SelectPage />);

    const drivingMode = screen.getAllByRole("combobox", { name: "Driving Mode" })[0];
    if (!drivingMode) throw new Error("missing Driving Mode select");
    await user.click(drivingMode);
    await user.click(screen.getByRole("option", { name: "Wet" }));

    expect(drivingMode).toHaveTextContent("Wet");
  });

  it("leaves the static With value example on Sport", async () => {
    const user = userEvent.setup();
    render(<SelectPage />);

    const withValue = combobox("With value");
    await user.click(withValue);
    await user.click(screen.getByRole("option", { name: "Race" }));

    expect(withValue).toHaveTextContent("Sport");
    expect(withValue).not.toHaveTextContent("Race");
  });

  it("shows Race Strategy picks and clears them on Reset", async () => {
    const user = userEvent.setup();
    render(<SelectPage />);

    await user.click(combobox("Starting tyre"));
    await user.click(screen.getByRole("option", { name: "Hard (C1)" }));
    await user.click(combobox("Pit window"));
    await user.click(screen.getByRole("option", { name: "Lap 20–25" }));

    expect(combobox("Starting tyre")).toHaveTextContent("Hard (C1)");
    expect(combobox("Pit window")).toHaveTextContent("Lap 20–25");

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(combobox("Starting tyre")).toHaveTextContent("Select compound…");
    expect(combobox("Pit window")).toHaveTextContent("Select lap…");
  });
});

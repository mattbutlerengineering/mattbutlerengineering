import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { FLOOR_MATERIALS } from "@mbe/types";
import { PlanFloorMaterialPicker } from "./PlanFloorMaterialPicker.js";

// jsdom has no scrollIntoView; rialto's open listbox scrolls to its active option.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const AXE = { rules: { "color-contrast": { enabled: false } } };

function renderPicker(props: Partial<React.ComponentProps<typeof PlanFloorMaterialPicker>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <main>
      <PlanFloorMaterialPicker value={null} onChange={onChange} {...props} />
    </main>
  );
  return { ...result, onChange };
}

describe("PlanFloorMaterialPicker", () => {
  it("is a named combobox for the room floor", () => {
    renderPicker();
    expect(screen.getByRole("combobox", { name: "Room floor" })).toBeTruthy();
  });

  it("offers None plus every texture", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(FLOOR_MATERIALS.length + 1);
    expect(options).toContain("None");
    expect(options).toContain("Hardwood");
  });

  it("reports the chosen material", async () => {
    const { onChange } = renderPicker();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Concrete" }));
    expect(onChange).toHaveBeenCalledWith("concrete");
  });

  it("reports null for None", async () => {
    const { onChange } = renderPicker({ value: "tile" });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("is operable from the keyboard", async () => {
    const { onChange } = renderPicker();
    screen.getByRole("combobox").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows the saved material", () => {
    renderPicker({ value: "marble" });
    expect(screen.getByRole("combobox").textContent).toContain("Marble");
  });

  it("has no axe violations", async () => {
    const { container } = renderPicker();
    expect((await axe(container, AXE)).violations).toEqual([]);
  });
});

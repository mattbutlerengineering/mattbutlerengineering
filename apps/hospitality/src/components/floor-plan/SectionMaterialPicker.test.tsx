import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import type { FloorPlanSection } from "@mbe/types";
import { FLOOR_MATERIALS } from "@mbe/types";
import { SectionMaterialPicker } from "./SectionMaterialPicker.js";

// jsdom has no scrollIntoView; rialto's open listbox scrolls to its active option.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const AXE = { rules: { "color-contrast": { enabled: false } } };

const section: FloorPlanSection = {
  id: "sec-1",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  name: "Patio",
  color: "#3366cc",
  displayOrder: 0,
  floorMaterial: null,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
};

function renderPicker(props: Partial<React.ComponentProps<typeof SectionMaterialPicker>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <main>
      <SectionMaterialPicker section={section} onChange={onChange} {...props} />
    </main>
  );
  return { ...result, onChange };
}

describe("SectionMaterialPicker", () => {
  it("names the section it controls, so several pickers stay distinguishable", () => {
    renderPicker();
    expect(screen.getByRole("combobox", { name: /Patio/ })).toBeTruthy();
  });

  it("offers every material plus an explicit way to clear one", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("combobox"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(FLOOR_MATERIALS.length + 1);
    expect(options).toContain("Hardwood");
    expect(options).toContain("Marble");
    expect(options).toContain("None");
  });

  it("reports the chosen material", async () => {
    const { onChange } = renderPicker();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Carpet" }));
    expect(onChange).toHaveBeenCalledWith("carpet");
  });

  it("reports null when the operator clears the material", async () => {
    const { onChange } = renderPicker({
      section: { ...section, floorMaterial: "tile" },
    });
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the material already saved on the section", () => {
    renderPicker({ section: { ...section, floorMaterial: "marble" } });
    expect(screen.getByRole("combobox").textContent).toContain("Marble");
  });

  it("has no axe violations", async () => {
    const { container } = renderPicker();
    expect((await axe(container, AXE)).violations).toEqual([]);
  });
});

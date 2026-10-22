import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ROOM_SIZES, ROOM_TEMPLATES } from "./room-templates.js";
import { TemplatePicker, type TemplatePickerProps } from "./TemplatePicker.js";

// jsdom cannot compute colour contrast; token-level contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function renderPicker(overrides: Partial<TemplatePickerProps> = {}) {
  const onChange = vi.fn();
  const result = render(
    <main>
      <TemplatePicker
        templateId="fine-dining"
        sizeId="standard"
        onChange={onChange}
        {...overrides}
      />
    </main>
  );
  return { ...result, onChange };
}

function templateGroup() {
  return screen.getByRole("radiogroup", { name: "Room template" });
}

function sizeGroup() {
  return screen.getByRole("radiogroup", { name: "Room size" });
}

describe("TemplatePicker", () => {
  it("offers all seven room templates and all four sizes", () => {
    renderPicker();

    expect(within(templateGroup()).getAllByRole("radio")).toHaveLength(ROOM_TEMPLATES.length);
    expect(within(sizeGroup()).getAllByRole("radio")).toHaveLength(ROOM_SIZES.length);
  });

  it("names every template and every size from the catalog", () => {
    renderPicker();

    for (const name of [
      "Blank",
      "Fine Dining",
      "Casual Bistro",
      "Bar & Lounge",
      "Café",
      "Banquet Hall",
      "Open Kitchen",
    ]) {
      expect(within(templateGroup()).getByRole("radio", { name: new RegExp(name) })).toBeVisible();
    }
    for (const name of ["Cozy", "Standard", "Spacious", "Grand"]) {
      expect(within(sizeGroup()).getByRole("radio", { name: new RegExp(name) })).toBeVisible();
    }
  });

  it("checks exactly the selected template and size", () => {
    renderPicker({ templateId: "cafe", sizeId: "grand" });

    const checkedTemplates = within(templateGroup())
      .getAllByRole("radio")
      .filter((node) => node.getAttribute("aria-checked") === "true");
    const checkedSizes = within(sizeGroup())
      .getAllByRole("radio")
      .filter((node) => node.getAttribute("aria-checked") === "true");

    expect(checkedTemplates.map((node) => node.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Café"),
    ]);
    expect(checkedSizes.map((node) => node.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Grand"),
    ]);
  });

  it("reports the new template while keeping the chosen size", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ templateId: "blank", sizeId: "spacious" });

    await user.click(within(templateGroup()).getByRole("radio", { name: /Banquet Hall/ }));

    expect(onChange).toHaveBeenCalledWith({ templateId: "banquet-hall", sizeId: "spacious" });
  });

  it("reports the new size while keeping the chosen template", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ templateId: "open-kitchen", sizeId: "cozy" });

    await user.click(within(sizeGroup()).getByRole("radio", { name: /Grand/ }));

    expect(onChange).toHaveBeenCalledWith({ templateId: "open-kitchen", sizeId: "grand" });
  });

  it("moves between templates with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ templateId: "blank", sizeId: "standard" });

    const group = templateGroup();
    within(group).getAllByRole("radio")[0]!.focus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith({ templateId: "fine-dining", sizeId: "standard" });

    onChange.mockClear();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith({ templateId: "open-kitchen", sizeId: "standard" });

    onChange.mockClear();
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith({ templateId: "open-kitchen", sizeId: "standard" });

    onChange.mockClear();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith({ templateId: "blank", sizeId: "standard" });
  });

  it("keeps only the selected card in the tab order", () => {
    renderPicker({ templateId: "cafe", sizeId: "standard" });

    const tabbable = within(templateGroup())
      .getAllByRole("radio")
      .filter((node) => node.getAttribute("tabindex") === "0");

    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveAttribute("aria-label", expect.stringContaining("Café"));
  });

  it("reports nothing while disabled", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ disabled: true });

    await user.click(within(templateGroup()).getByRole("radio", { name: /Blank/ }));
    within(templateGroup()).getAllByRole("radio")[0]!.focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("previews the selected template at the selected size", () => {
    renderPicker({ templateId: "banquet-hall", sizeId: "grand" });

    const preview = screen.getByTestId("template-picker-preview");
    // Blank is the only template with no tables; Banquet Hall at Grand has 15.
    expect(preview.querySelectorAll("[data-preview='table']")).toHaveLength(15);
    expect(preview.querySelectorAll("[data-preview='section']")).toHaveLength(2);
  });

  // Venue onboarding refuses Next until a room is picked, so it needs a state
  // where nothing is checked rather than a silent default.
  describe("with no template chosen yet", () => {
    it("checks nothing", () => {
      renderPicker({ templateId: null });

      const checked = within(templateGroup())
        .getAllByRole("radio")
        .filter((node) => node.getAttribute("aria-checked") === "true");
      expect(checked).toEqual([]);
    });

    it("parks the tab stop on the first card so the group is still reachable", () => {
      renderPicker({ templateId: null });

      const tabbable = within(templateGroup())
        .getAllByRole("radio")
        .filter((node) => node.getAttribute("tabindex") === "0");
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveAttribute("aria-label", expect.stringContaining("Blank"));
    });

    it("holds the sizes closed, so picking one cannot answer the room question for you", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ templateId: null });

      for (const option of within(sizeGroup()).getAllByRole("radio")) {
        expect(option).toBeDisabled();
      }
      await user.click(within(sizeGroup()).getByRole("radio", { name: /Grand/ }));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("previews nothing, rather than guessing a template", () => {
      renderPicker({ templateId: null });
      expect(screen.queryByTestId("template-picker-preview")).toBeNull();
    });

    it("starts the arrow keys at the first card", async () => {
      const user = userEvent.setup();
      const { onChange } = renderPicker({ templateId: null, sizeId: "cozy" });

      within(templateGroup()).getAllByRole("radio")[0]!.focus();
      await user.keyboard("{ArrowRight}");

      expect(onChange).toHaveBeenLastCalledWith({ templateId: "fine-dining", sizeId: "cozy" });
    });

    it("has no axe violations", async () => {
      const { container } = renderPicker({ templateId: null });
      const results = await axe(container, AXE_OPTIONS);
      expect(results.violations).toEqual([]);
    });
  });

  it("has no axe violations", async () => {
    const { container } = renderPicker();
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });
});

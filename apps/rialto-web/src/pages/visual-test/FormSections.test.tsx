import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormSections } from "./FormSections";

describe("FormSections accessibility", () => {
  it("gives every slider an accessible name (axe `label`)", () => {
    render(<FormSections />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders.length).toBeGreaterThan(0);
    for (const slider of sliders) {
      expect(slider).toHaveAccessibleName();
    }
  });
});

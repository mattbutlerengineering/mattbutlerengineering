import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipPage } from "./TooltipPage";

/**
 * The icon triggers used to be padded Buttons forced to 32px. Horizontal
 * padding is 16px + 16px, so the content box is 0px wide. reset.css then
 * sets `svg { max-width: 100% }`, and the stroke paints at width 0 even
 * though the path and a contrasting currentColor are in the DOM.
 * IconButton is a padding-0 square, which is what keeps the glyph visible.
 */
describe("TooltipPage icon triggers", () => {
  it.each(["Upload", "Download", "Delete"])(
    "gives the %s trigger a padding-free square and a stroked glyph",
    (name) => {
      render(<TooltipPage />);
      const button = screen.getByRole("button", { name });

      expect(button.className).toMatch(/iconButton/);
      expect(button.style.width).not.toBe("32px");
      expect(button.style.height).not.toBe("32px");

      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("stroke")).toBe("currentColor");
      expect(svg?.querySelector("path")).not.toBeNull();
    }
  );

  it("paints Delete in the error token and the others in the button text colour", () => {
    render(<TooltipPage />);

    expect(screen.getByRole("button", { name: "Delete" }).style.color).toBe("var(--rialto-error)");
    expect(screen.getByRole("button", { name: "Upload" }).style.color).toBe("");
    expect(screen.getByRole("button", { name: "Download" }).style.color).toBe("");
  });
});

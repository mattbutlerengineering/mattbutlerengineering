import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuestSurface } from "./GuestSurface";

describe("GuestSurface", () => {
  it("marks its subtree as a guest surface without adding a layout box", () => {
    render(
      <GuestSurface>
        <p>guest page</p>
      </GuestSurface>
    );
    const marker = screen.getByText("guest page").parentElement;
    expect(marker?.hasAttribute("data-guest-surface")).toBe(true);
    expect(marker?.style.display).toBe("contents");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HoverCardPage } from "./HoverCardPage";

describe("HoverCardPage contrast", () => {
  it("does not use --rialto-accent as a text colour (3.15:1 on surface in light theme)", () => {
    render(<HoverCardPage />);
    const trigger = screen.getAllByText("Charles Leclerc")[0] as HTMLElement;
    expect(trigger.style.color).not.toBe("var(--rialto-accent)");
  });
});

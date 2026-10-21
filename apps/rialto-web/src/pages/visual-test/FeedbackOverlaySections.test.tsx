import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedbackOverlaySections } from "./FeedbackOverlaySections";

describe("FeedbackOverlaySections", () => {
  it("names every progress bar (axe aria-progressbar-name, #7188)", () => {
    render(<FeedbackOverlaySections />);
    for (const bar of screen.getAllByRole("progressbar")) {
      expect(bar).toHaveAccessibleName();
    }
  });
});

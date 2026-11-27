import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AvailabilityGuidePage } from "./AvailabilityGuidePage.js";
import { GUIDE_EXAMPLES } from "../components/availability-guide/availability-guide-examples.js";

function renderPage() {
  return render(
    <MemoryRouter>
      <AvailabilityGuidePage />
    </MemoryRouter>
  );
}

describe("AvailabilityGuidePage", () => {
  it("renders one h1, How availability works", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("How availability works");
  });

  it("orders the sections as the Availability rail does", () => {
    renderPage();
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual([
      "Overview",
      "When you’re open",
      "Where guests sit",
      "Worked examples",
      "Why can’t a guest book that time?",
    ]);
  });

  it("walks the layers under When you’re open", () => {
    renderPage();
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names.slice(0, 5)).toEqual([
      "Regular hours",
      "Seasonal hours",
      "Special dates",
      "Closures and pauses",
      "Booking rules",
    ]);
  });

  it("shows every worked example, with the times the engine returns", () => {
    renderPage();
    const examples = screen.getAllByTestId("guide-example");
    expect(examples).toHaveLength(GUIDE_EXAMPLES.length);
    // \s: newer ICU puts a narrow no-break space before PM.
    expect(within(examples[0]!).getByText(/4:00\sPM,\s5:00\sPM$/)).toBeInTheDocument();
  });

  it("never falls back to a raw catalog key", () => {
    const { container } = renderPage();
    expect(container.textContent).not.toContain("availabilityHub.guide");
  });

  it("links back to the Availability hub", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /back to availability/i })).toHaveAttribute(
      "href",
      "/availability"
    );
  });
});

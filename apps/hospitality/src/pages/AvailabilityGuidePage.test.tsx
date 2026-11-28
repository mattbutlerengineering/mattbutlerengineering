import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AvailabilityGuidePage } from "./AvailabilityGuidePage.js";
import { GUIDE_EXAMPLES } from "../components/availability-guide/availability-guide-examples.js";
import enUS from "../i18n/catalogs/en-US.json";

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

  it("has a checklist step for every layer the overview lists", () => {
    renderPage();
    const overview = screen.getByRole("heading", { level: 2, name: "Overview" }).closest("section");
    const layerNames = within(overview as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.split(":")[0] ?? "");
    expect(layerNames).toHaveLength(6);

    const checklist = screen
      .getByRole("heading", { level: 2, name: "Why can’t a guest book that time?" })
      .closest("section");
    const steps = within(checklist as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    // Each overview layer is named by the first words of the step that checks it.
    const stepFor: Record<string, string> = {
      "Regular hours": "Regular hours",
      "Seasonal hours": "Seasonal hours",
      "Other hours for one date": "Other hours",
      "Special hours": "Special hours",
      "Closures and pauses": "Closures",
      "Changes made for tonight": "Tonight",
    };
    for (const layer of layerNames) {
      const prefix = stepFor[layer];
      expect(prefix, `no checklist prefix known for layer "${layer}"`).toBeDefined();
      expect(
        steps.some((s) => s.startsWith(`${prefix}:`)),
        `no checklist step for layer "${layer}"`
      ).toBe(true);
    }
  });

  it("checks Special hours, then Other hours, then Seasonal hours, then Regular hours", () => {
    renderPage();
    const checklist = screen
      .getByRole("heading", { level: 2, name: "Why can’t a guest book that time?" })
      .closest("section");
    const order = within(checklist as HTMLElement)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.split(":")[0]);
    const at = (name: string) => order.indexOf(name);
    expect(at("Special hours")).toBeLessThan(at("Other hours"));
    expect(at("Other hours")).toBeLessThan(at("Seasonal hours"));
    expect(at("Seasonal hours")).toBeLessThan(at("Regular hours"));
  });

  it("ends the checklist at the Calendar day drawer's Why this day", () => {
    renderPage();
    const checklist = screen
      .getByRole("heading", { level: 2, name: "Why can’t a guest book that time?" })
      .closest("section");
    const steps = within(checklist as HTMLElement).getAllByRole("listitem");
    // The drawer's own heading, so a rename there breaks this pointer here.
    expect(steps.at(-1)).toHaveTextContent(enUS.availability.drawer.whyTitle);
    expect(steps.at(-1)).toHaveTextContent("Calendar");
  });

  it("says Check a date shows one sentence, not the list of layers", () => {
    renderPage();
    const checklist = screen
      .getByRole("heading", { level: 2, name: "Why can’t a guest book that time?" })
      .closest("section");
    const first = within(checklist as HTMLElement).getAllByRole("listitem")[0];
    expect(first).toHaveTextContent(/^Check a date:.*one sentence/);
    expect(first).not.toHaveTextContent(/lists the layers/);
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

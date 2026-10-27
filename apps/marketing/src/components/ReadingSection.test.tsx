import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RialtoProvider } from "@mattbutlerengineering/rialto";
import type { WeeklyResource } from "../data/weekly-intake.js";
import { ReadingSection } from "./ReadingSection.js";

const item: WeeklyResource = {
  id: "a",
  title: "A fine read",
  url: "https://example.com/a",
  source: "js-weekly",
  description: "d",
  publishedAt: "2026-10-20",
  tags: ["t"],
};

function renderSection(items: readonly WeeklyResource[]) {
  return render(
    <RialtoProvider vibe="presenting">
      <MemoryRouter>
        <ReadingSection items={items} />
      </MemoryRouter>
    </RialtoProvider>
  );
}

describe("ReadingSection", () => {
  it("renders nothing at all when there are no items", () => {
    const { container } = renderSection([]);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("link", { name: /browse the stack/i })).toBeNull();
    expect(container.querySelector("[data-reveal]")).toBeNull();
  });

  it("lists each item and links to the full intake when items exist", () => {
    renderSection([item]);
    expect(
      screen.getByRole("heading", { level: 2, name: /what i'm reading/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "A fine read" })).toHaveAttribute(
      "href",
      "https://example.com/a"
    );
    expect(screen.getByRole("link", { name: /browse the stack/i })).toHaveAttribute(
      "href",
      "/weekly"
    );
  });
});

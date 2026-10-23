import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { roomTemplateById } from "./room-templates.js";
import { TemplateMiniPreview } from "./TemplateMiniPreview.js";

// jsdom cannot compute colour contrast; token-level contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const fineDining = roomTemplateById("fine-dining").build(1200, 800);
const blank = roomTemplateById("blank").build(800, 600);

describe("TemplateMiniPreview", () => {
  it("draws one element for every wall, section and table in the layout", () => {
    const { container } = render(<TemplateMiniPreview layout={fineDining} />);

    expect(container.querySelectorAll("[data-preview='wall']")).toHaveLength(
      fineDining.walls.length
    );
    expect(container.querySelectorAll("[data-preview='section']")).toHaveLength(
      fineDining.sections.length
    );
    expect(container.querySelectorAll("[data-preview='table']")).toHaveLength(
      fineDining.tables.length
    );
  });

  it("positions a table as a percentage of the canvas, from its top-left corner", () => {
    const { container } = render(<TemplateMiniPreview layout={fineDining} />);
    const first = fineDining.tables[0]!;
    const node = container.querySelector(`[data-preview-id='${first.id}']`);

    expect(node).not.toBeNull();
    const style = (node as HTMLElement).style;
    expect(style.left).toBe(`${((first.x - first.width / 2) / fineDining.width) * 100}%`);
    expect(style.top).toBe(`${((first.y - first.height / 2) / fineDining.height) * 100}%`);
    expect(style.width).toBe(`${(first.width / fineDining.width) * 100}%`);
    expect(style.height).toBe(`${(first.height / fineDining.height) * 100}%`);
  });

  it("names each section on its zone, so colour is never the only cue", () => {
    render(<TemplateMiniPreview layout={fineDining} />);
    for (const section of fineDining.sections) {
      expect(screen.getByText(section.name)).toBeInTheDocument();
    }
  });

  it("describes the layout for a screen reader", () => {
    render(<TemplateMiniPreview layout={fineDining} />);
    expect(screen.getByRole("img", { name: /20 tables and 2 sections/i })).toBeInTheDocument();
  });

  it("describes an empty floor rather than counting nothing", () => {
    render(<TemplateMiniPreview layout={blank} />);
    expect(screen.getByRole("img", { name: /empty floor/i })).toBeInTheDocument();
  });

  it("lets the caller supply its own description", () => {
    render(<TemplateMiniPreview layout={fineDining} ariaLabel="Fine Dining, standard" />);
    expect(screen.getByRole("img", { name: "Fine Dining, standard" })).toBeInTheDocument();
  });

  it("hides itself from assistive tech when the caller already names the template", () => {
    const { container } = render(<TemplateMiniPreview layout={fineDining} decorative />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no scaling NaN when handed a degenerate canvas", () => {
    const { container } = render(
      <TemplateMiniPreview layout={{ ...blank, width: 0, height: 0 }} />
    );
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <TemplateMiniPreview layout={fineDining} />
      </main>
    );
    const results = await axe(container, AXE_OPTIONS);
    expect(results.violations).toEqual([]);
  });
});

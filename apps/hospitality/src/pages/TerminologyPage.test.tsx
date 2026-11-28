import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "vitest-axe";
import { TerminologyPage } from "./TerminologyPage.js";
import { TERM_GROUPS, TERM_RELATIONS } from "../i18n/terminology.js";
import enUS from "../i18n/catalogs/en-US.json";

function renderPage() {
  return render(
    <MemoryRouter>
      <main>
        <TerminologyPage />
      </main>
    </MemoryRouter>
  );
}

const DEFINITIONS = enUS.terminology.definitions as Record<string, string>;
const TERMS = enUS.terminology.terms as Record<string, string>;

describe("TerminologyPage", () => {
  it("renders exactly one h1, Terminology, through PageHeader", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Terminology");
  });

  it("groups the terms by area, then the diagram", () => {
    renderPage();
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual([
      "Availability",
      "Your venue",
      "Reservations and guests",
      "How the terms fit together",
    ]);
  });

  it("defines every listed term with its definition", () => {
    renderPage();
    const names = screen.getAllByRole("term");
    for (const { id, term } of TERM_GROUPS.flatMap((g) => g.terms)) {
      const name = names.find((n) => n.textContent === term);
      expect(name, id).toBeDefined();
      const definition = name!.nextElementSibling;
      expect(definition, id).toHaveTextContent(DEFINITIONS[id]!);
    }
  });

  it("lists each term once", () => {
    renderPage();
    const count = TERM_GROUPS.flatMap((g) => g.terms).length;
    expect(screen.getAllByRole("term")).toHaveLength(count);
  });

  it("never falls back to a raw catalog key", () => {
    const { container } = renderPage();
    expect(container.textContent).not.toContain("terminology.");
  });

  it("links back to settings", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Back to settings" })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  describe("relationship diagram", () => {
    it("draws every node as a term the page defines", () => {
      renderPage();
      const nodes = screen.getAllByTestId("diagram-node").map((n) => n.textContent ?? "");
      const defined = new Set(
        TERM_GROUPS.flatMap((g) => g.terms)
          .filter(({ id }) => DEFINITIONS[id])
          .map(({ id }) => TERMS[id]!.replace(/ /g, ""))
      );
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.filter((text) => !defined.has(text.replace(/ /g, "")))).toEqual([]);
    });

    it("is an image with a name, described by the same relationships as a list", () => {
      renderPage();
      const diagram = screen.getByRole("img", { name: /relationship diagram/i });
      const listId = diagram.getAttribute("aria-describedby");
      const list = document.getElementById(listId!);
      expect(list).not.toBeNull();
      expect(within(list!).getAllByRole("listitem")).toHaveLength(TERM_RELATIONS.length);
      expect(list).toHaveTextContent("Venue group has many Venue");
      expect(list).toHaveTextContent("Reservation may require a Deposit (only sometimes)");
    });
  });

  it("has no axe violations", async () => {
    const { container } = renderPage();
    const result = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

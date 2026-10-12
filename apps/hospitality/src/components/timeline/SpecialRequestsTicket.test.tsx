import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SpecialRequestsTicket } from "./SpecialRequestsTicket.js";
import { CONFIRMATION_COPY } from "../../constants/confirmation-copy.js";
import {
  EMPTY_NOTES,
  TWO_LINE_DISPLAYED,
  TWO_LINE_NOTE,
  UNTRUSTED_NOTE,
} from "../../test/special-requests-fixtures.js";

const label = CONFIRMATION_COPY.specialRequestsLabel;

function wordsOf(group: HTMLElement): HTMLElement {
  const words = group.querySelector<HTMLElement>('[dir="auto"]');
  if (!words) throw new Error("no words element in the Special Requests group");
  return words;
}

describe("SpecialRequestsTicket", () => {
  it("names the group Special Requests and shows what guests are told", () => {
    render(<SpecialRequestsTicket notes={TWO_LINE_NOTE} />);
    const group = screen.getByRole("group", { name: label });
    expect(within(group).getByText(CONFIRMATION_COPY.hostCaption)).toBeDefined();
  });

  it("renders the guest's words as one text node, line break kept, dir=auto", () => {
    render(<SpecialRequestsTicket notes={TWO_LINE_NOTE} />);
    const words = wordsOf(screen.getByRole("group", { name: label }));
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(words.firstChild?.nodeValue).toBe(TWO_LINE_DISPLAYED);
    expect(words.classList.contains("notesValue")).toBe(true);
  });

  it("holds nothing focusable and no live region", () => {
    render(<SpecialRequestsTicket notes={TWO_LINE_NOTE} />);
    const group = screen.getByRole("group", { name: label });
    expect(group.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(
      0
    );
    expect(group.closest("[aria-live]")).toBeNull();
    expect(group.querySelector("[aria-live]")).toBeNull();
  });

  it("keeps untrusted text as literal characters", () => {
    render(<SpecialRequestsTicket notes={UNTRUSTED_NOTE} />);
    const group = screen.getByRole("group", { name: label });
    const words = wordsOf(group);
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeValue).toBe(UNTRUSTED_NOTE);
    expect(group.querySelector("script, a")).toBeNull();
  });

  it.each(EMPTY_NOTES)("renders nothing at all for %j", (notes) => {
    const { container } = render(<SpecialRequestsTicket notes={notes} />);
    expect(container.firstChild).toBeNull();
  });

  it("wraps the words in the recessed box (CSS text)", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/timeline/SpecialRequestsTicket.module.css"),
      "utf-8"
    );
    const rule = css.match(/\.notesValue\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/white-space:\s*pre-wrap;/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(rule).toMatch(/background:\s*var\(--rialto-surface-recessed\);/);
  });
});

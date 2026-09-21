import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Letterboard } from "./Letterboard";

describe("Letterboard", () => {
  describe("accessible reading", () => {
    it("reads each row as ordinary text, not as a pile of single characters", () => {
      render(<Letterboard lines={["TODAY ONLY", "OYSTERS $1"]} />);
      expect(screen.getByText("TODAY ONLY")).toBeInTheDocument();
      expect(screen.getByText("OYSTERS $1")).toBeInTheDocument();
    });

    it("keeps the reading out of sight and the ridges out of the accessibility tree", () => {
      const { container } = render(<Letterboard lines={["SOUP"]} />);
      expect(container.querySelector(".reading")).not.toHaveAttribute("aria-hidden");
      expect(container.querySelector(".plate")).toHaveAttribute("aria-hidden", "true");
    });

    it("reads a segmented row as one continuous string, not run by run", () => {
      const { container } = render(
        <Letterboard lines={[[{ text: "PIE " }, { text: "$4", accent: true }]]} />
      );
      expect(container.querySelector(".reading p")).toHaveTextContent("PIE $4");
    });

    it("reads the author's own casing — only the board's pieces are upper-case", () => {
      const { container } = render(<Letterboard lines={["Oysters"]} />);
      expect(container.querySelector(".reading")).toHaveTextContent("Oysters");
      expect(container.querySelector(".plate")).toHaveTextContent("OYSTERS");
    });
  });

  describe("accent letters", () => {
    it("slots one piece per character and flags the accent run", () => {
      const { container } = render(
        <Letterboard lines={[[{ text: "AB" }, { text: "C", accent: true }]]} />
      );
      const pieces = [...container.querySelectorAll(".tile")];
      expect(pieces.map((piece) => piece.textContent)).toEqual(["A", "B", "C"]);
      expect(pieces.map((piece) => piece.getAttribute("data-accent"))).toEqual([
        "false",
        "false",
        "true",
      ]);
    });

    it("carries the accent in the reading as emphasis, so colour is never the only signal", () => {
      const { container } = render(
        <Letterboard lines={[[{ text: "PIE " }, { text: "$4", accent: true }]]} />
      );
      const emphasised = [...container.querySelectorAll(".reading strong")];
      expect(emphasised.map((node) => node.textContent)).toEqual(["$4"]);
    });

    it("leaves a space as a bare ridge rather than a letter piece", () => {
      const { container } = render(<Letterboard lines={["A B"]} />);
      expect(container.querySelectorAll(".tile")).toHaveLength(2);
      expect(container.querySelectorAll(".space")).toHaveLength(1);
    });
  });

  describe("ridges", () => {
    it("cuts one ridge per line", () => {
      const { container } = render(<Letterboard lines={["ONE", "TWO", "THREE"]} />);
      expect(container.querySelectorAll(".slot")).toHaveLength(3);
    });

    it("keeps an empty line as a bare ridge", () => {
      const { container } = render(<Letterboard lines={["ONE", "", "TWO"]} />);
      expect(container.querySelectorAll(".slot")).toHaveLength(3);
      expect(container.querySelectorAll(".tile")).toHaveLength(6);
    });
  });

  describe("size and alignment", () => {
    it("applies the md size and centred alignment by default", () => {
      const { container } = render(<Letterboard lines={["A"]} />);
      expect(container.firstElementChild?.className).toMatch(/sizeMd/);
      expect(container.firstElementChild?.className).toMatch(/alignCenter/);
    });

    it("applies the sm and lg size presets", () => {
      const { container, rerender } = render(<Letterboard lines={["A"]} size="sm" />);
      expect(container.firstElementChild?.className).toMatch(/sizeSm/);
      rerender(<Letterboard lines={["A"]} size="lg" />);
      expect(container.firstElementChild?.className).toMatch(/sizeLg/);
    });

    it("applies the start and end alignments", () => {
      const { container, rerender } = render(<Letterboard lines={["A"]} align="start" />);
      expect(container.firstElementChild?.className).toMatch(/alignStart/);
      rerender(<Letterboard lines={["A"]} align="end" />);
      expect(container.firstElementChild?.className).toMatch(/alignEnd/);
    });
  });

  describe("className, ref and rest", () => {
    it("forwards className, ref and extra attributes to the root", () => {
      const ref = { current: null as HTMLDivElement | null };
      const { container } = render(
        <Letterboard lines={["A"]} className="custom" ref={ref} data-testid="board" />
      );
      expect(container.firstElementChild?.className).toMatch(/custom/);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(screen.getByTestId("board")).toBe(container.firstElementChild);
    });
  });
});

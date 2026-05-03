import { render, screen, within } from "@testing-library/react";
import { Chalkboard, ChalkboardSection, ChalkboardItem } from "./Chalkboard";

describe("Chalkboard", () => {
  describe("semantic structure", () => {
    it("renders title as an h2", () => {
      render(
        <Chalkboard title="Today's Specials">
          <ChalkboardSection heading="Starters">
            <ChalkboardItem name="Crab Cakes" price="$14" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(
        screen.getByRole("heading", { level: 2, name: "Today's Specials" })
      ).toBeInTheDocument();
    });

    it("renders section heading as h3 nested under the board", () => {
      render(
        <Chalkboard title="Menu">
          <ChalkboardSection heading="Starters">
            <ChalkboardItem name="Crab Cakes" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(screen.getByRole("heading", { level: 3, name: "Starters" })).toBeInTheDocument();
    });

    it("renders items as a proper list", () => {
      render(
        <Chalkboard title="Menu">
          <ChalkboardSection heading="Mains">
            <ChalkboardItem name="Steak" price="$28" />
            <ChalkboardItem name="Fish" price="$24" />
          </ChalkboardSection>
        </Chalkboard>
      );
      const list = screen.getByRole("list");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(2);
    });
  });

  describe("items", () => {
    it("displays name, price, and description when provided", () => {
      render(
        <Chalkboard title="Menu">
          <ChalkboardSection>
            <ChalkboardItem name="Caesar Salad" price="$10" description="with shaved parmesan" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(screen.getByText("Caesar Salad")).toBeInTheDocument();
      expect(screen.getByText("$10")).toBeInTheDocument();
      expect(screen.getByText("with shaved parmesan")).toBeInTheDocument();
    });

    it("renders 'sold out' label as actual text for screen readers", () => {
      render(
        <Chalkboard title="Menu">
          <ChalkboardSection>
            <ChalkboardItem name="Oysters" price="$18" soldOut />
          </ChalkboardSection>
        </Chalkboard>
      );
      // The label must be announced — not just a strikethrough style
      expect(screen.getByText(/sold out/i)).toBeInTheDocument();
    });
  });

  describe("subtitle and variants", () => {
    it("renders subtitle when provided", () => {
      render(
        <Chalkboard title="Menu" subtitle="March 15">
          <ChalkboardSection>
            <ChalkboardItem name="Special" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(screen.getByText("March 15")).toBeInTheDocument();
    });

    it("applies variant styling without breaking semantics", () => {
      render(
        <Chalkboard title="Menu" variant="green">
          <ChalkboardSection>
            <ChalkboardItem name="Special" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    });
  });

  describe("framed mode", () => {
    it("still renders content correctly when framed", () => {
      render(
        <Chalkboard title="Menu" framed>
          <ChalkboardSection heading="Mains">
            <ChalkboardItem name="Steak" price="$28" />
          </ChalkboardSection>
        </Chalkboard>
      );
      expect(screen.getByRole("heading", { level: 2, name: "Menu" })).toBeInTheDocument();
      expect(screen.getByText("Steak")).toBeInTheDocument();
    });
  });
});

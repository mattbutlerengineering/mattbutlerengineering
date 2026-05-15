import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion } from "./Accordion";
import type { AccordionItem } from "./Accordion";

const items: AccordionItem[] = [
  { id: "a", title: "Section A", content: <p>Content A</p> },
  { id: "b", title: "Section B", content: <p>Content B</p> },
  { id: "c", title: "Section C", content: <p>Content C</p>, disabled: true },
];

describe("Accordion", () => {
  describe("rendering", () => {
    it("renders trigger buttons for each item", () => {
      render(<Accordion items={items} />);
      expect(screen.getByRole("button", { name: "Section A" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Section B" })).toBeInTheDocument();
    });

    it("renders content for defaultOpen items", () => {
      render(<Accordion items={items} defaultOpen={["a"]} />);
      expect(screen.getByText("Content A")).toBeInTheDocument();
    });

    it("does not render content for closed items", () => {
      render(<Accordion items={items} />);
      expect(screen.queryByText("Content A")).not.toBeInTheDocument();
    });

    it("forwards className", () => {
      const { container } = render(<Accordion items={items} className="custom" />);
      expect(container.firstElementChild?.className).toMatch(/custom/);
    });

    it("forwards ref", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Accordion items={items} ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("expand/collapse", () => {
    it("expands a panel on click", async () => {
      const user = userEvent.setup();
      render(<Accordion items={items} />);
      await user.click(screen.getByRole("button", { name: "Section A" }));
      expect(screen.getByText("Content A")).toBeInTheDocument();
    });

    it("collapses an open panel on second click", async () => {
      const user = userEvent.setup();
      render(<Accordion items={items} defaultOpen={["a"]} />);
      await user.click(screen.getByRole("button", { name: "Section A" }));
      expect(screen.queryByText("Content A")).not.toBeInTheDocument();
    });

    it("closes previously open panel in single mode (default)", async () => {
      const user = userEvent.setup();
      render(<Accordion items={items} defaultOpen={["a"]} />);
      await user.click(screen.getByRole("button", { name: "Section B" }));
      expect(screen.queryByText("Content A")).not.toBeInTheDocument();
      expect(screen.getByText("Content B")).toBeInTheDocument();
    });

    it("allows multiple open panels in multiple mode", async () => {
      const user = userEvent.setup();
      render(<Accordion items={items} multiple />);
      await user.click(screen.getByRole("button", { name: "Section A" }));
      await user.click(screen.getByRole("button", { name: "Section B" }));
      expect(screen.getByText("Content A")).toBeInTheDocument();
      expect(screen.getByText("Content B")).toBeInTheDocument();
    });
  });

  describe("headingLevel", () => {
    it("wraps triggers in h3 by default", () => {
      const { container } = render(<Accordion items={items} />);
      expect(container.querySelectorAll("h3").length).toBeGreaterThan(0);
    });

    it("wraps triggers in the specified heading level", () => {
      const { container } = render(<Accordion items={items} headingLevel="h2" />);
      expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
    });
  });

  describe("aria attributes", () => {
    it("sets aria-expanded to false on closed triggers", () => {
      render(<Accordion items={items} />);
      expect(screen.getByRole("button", { name: "Section A" })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    });

    it("sets aria-expanded to true on open triggers", async () => {
      const user = userEvent.setup();
      render(<Accordion items={items} />);
      await user.click(screen.getByRole("button", { name: "Section A" }));
      expect(screen.getByRole("button", { name: "Section A" })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible } from "./Collapsible";

describe("Collapsible", () => {
  describe("rendering", () => {
    it("renders trigger text", () => {
      render(<Collapsible trigger="Show details">Hidden</Collapsible>);
      expect(screen.getByRole("button", { name: /show details/i })).toBeInTheDocument();
    });

    it("hides content when closed by default", () => {
      render(<Collapsible trigger="Toggle">Content</Collapsible>);
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("shows content when defaultOpen is true", () => {
      render(
        <Collapsible trigger="Toggle" defaultOpen>
          Content
        </Collapsible>
      );
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("renders heading wrapper when headingTag is provided", () => {
      const { container } = render(
        <Collapsible trigger="FAQ" headingTag="h3">
          Answer
        </Collapsible>
      );
      expect(container.querySelector("h3")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <Collapsible trigger="Toggle" className="custom">
          Content
        </Collapsible>
      );
      expect(container.firstElementChild?.className).toMatch(/custom/);
    });
  });

  describe("uncontrolled open/close", () => {
    it("opens on trigger click", async () => {
      const user = userEvent.setup();
      render(<Collapsible trigger="Open me">Content here</Collapsible>);
      await user.click(screen.getByRole("button"));
      expect(screen.getByText("Content here")).toBeInTheDocument();
    });

    it("closes on second trigger click", async () => {
      const user = userEvent.setup();
      render(
        <Collapsible trigger="Toggle" defaultOpen>
          Content here
        </Collapsible>
      );
      await user.click(screen.getByRole("button"));
      expect(screen.queryByText("Content here")).not.toBeInTheDocument();
    });
  });

  describe("controlled mode", () => {
    it("respects controlled open=true", () => {
      render(
        <Collapsible trigger="Toggle" open onOpenChange={() => {}}>
          Controlled content
        </Collapsible>
      );
      expect(screen.getByText("Controlled content")).toBeInTheDocument();
    });

    it("respects controlled open=false", () => {
      render(
        <Collapsible trigger="Toggle" open={false} onOpenChange={() => {}}>
          Hidden content
        </Collapsible>
      );
      expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    });

    it("calls onOpenChange when trigger is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <Collapsible trigger="Toggle" open={false} onOpenChange={onOpenChange}>
          Content
        </Collapsible>
      );
      await user.click(screen.getByRole("button"));
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe("aria attributes", () => {
    it("sets aria-expanded=false when closed", () => {
      render(<Collapsible trigger="Toggle">Content</Collapsible>);
      expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    });

    it("sets aria-expanded=true when open", async () => {
      const user = userEvent.setup();
      render(<Collapsible trigger="Toggle">Content</Collapsible>);
      await user.click(screen.getByRole("button"));
      expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("disabled", () => {
    it("does not open when disabled and clicked", async () => {
      const user = userEvent.setup();
      render(
        <Collapsible trigger="Toggle" disabled>
          Content
        </Collapsible>
      );
      await user.click(screen.getByRole("button"));
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <Collapsible trigger="Toggle" ref={ref}>
          Content
        </Collapsible>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

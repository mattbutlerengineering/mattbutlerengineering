import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  describe("controlled mode", () => {
    it("renders checked state from checked prop", () => {
      render(<Toggle label="Test" checked={true} />);
      const input = screen.getByRole("switch");
      expect(input).toBeChecked();
    });

    it("renders unchecked state from checked prop", () => {
      render(<Toggle label="Test" checked={false} />);
      const input = screen.getByRole("switch");
      expect(input).not.toBeChecked();
    });

    it("calls onCheckedChange when toggled", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Toggle label="Test" checked={false} onCheckedChange={onChange} />);

      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  describe("uncontrolled mode", () => {
    it("respects defaultChecked prop", () => {
      render(<Toggle label="Test" defaultChecked={true} />);
      const input = screen.getByRole("switch");
      expect(input).toBeChecked();
    });

    it("defaults to unchecked without defaultChecked", () => {
      render(<Toggle label="Test" />);
      const input = screen.getByRole("switch");
      expect(input).not.toBeChecked();
    });

    it("toggles state on click without checked prop", async () => {
      const user = userEvent.setup();
      render(<Toggle label="Test" />);
      const input = screen.getByRole("switch");

      expect(input).not.toBeChecked();
      await user.click(input);
      expect(input).toBeChecked();
    });

    it("calls onCheckedChange in uncontrolled mode", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Toggle label="Test" defaultChecked={false} onCheckedChange={onChange} />);

      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  describe("accessibility", () => {
    it("renders with role switch", () => {
      render(<Toggle label="Test" />);
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("associates label with input", () => {
      render(<Toggle label="Dark mode" />);
      expect(screen.getByRole("switch")).toHaveAccessibleName("Dark mode");
    });

    it("supports disabled state", () => {
      render(<Toggle label="Test" disabled />);
      expect(screen.getByRole("switch")).toBeDisabled();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the input element", () => {
      const ref = { current: null as HTMLInputElement | null };
      render(<Toggle label="Ref test" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe("className passthrough", () => {
    it("applies custom className to the wrapper div", () => {
      const { container } = render(<Toggle label="Test" className="my-toggle" />);
      expect(container.querySelector(".my-toggle")).toBeInTheDocument();
    });
  });

  describe("disabledReason", () => {
    it("renders a lock icon when disabled and disabledReason is provided", () => {
      const { container } = render(
        <Toggle label="Test" disabled disabledReason="Not available in your plan" />
      );
      // Lock icon from lucide-react renders as svg
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("does not render a lock icon when not disabled", () => {
      const { container } = render(
        <Toggle label="Test" disabledReason="Not available in your plan" />
      );
      // No lock shown when disabled is not set
      expect(container.querySelector('[class*="lockIcon"]')).not.toBeInTheDocument();
    });
  });

  describe("no label", () => {
    it("renders without a label element when label is omitted", () => {
      render(<Toggle checked={false} onCheckedChange={() => {}} />);
      // Should still have the switch input
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { PinInput } from "./PinInput";

// framer-motion's motion.input renders in jsdom only when `value` is non-empty
// (a jsdom/framer-motion 12 incompatibility). Tests that need empty-cell inputs
// query by container or use a non-empty value; other tests use non-empty value.

describe("PinInput", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<PinInput />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders the correct number of cells by querying container", () => {
      render(<PinInput length={4} value="1234" onChange={() => {}} />);
      // Each cell has aria-label "Digit N of 4"
      const cells = screen.getAllByLabelText(/Digit \d of 4/);
      expect(cells.length).toBe(4);
    });

    it("renders custom length", () => {
      render(<PinInput length={6} value="123456" onChange={() => {}} />);
      const cells = screen.getAllByLabelText(/Digit \d of 6/);
      expect(cells.length).toBe(6);
    });

    it("renders label when provided", () => {
      render(<PinInput label="Verification code" />);
      expect(screen.getByText("Verification code")).toBeInTheDocument();
    });

    it("renders hint when provided", () => {
      render(<PinInput hint="Enter the code from your email" />);
      expect(
        screen.getByText("Enter the code from your email")
      ).toBeInTheDocument();
    });

    it("has correct aria-label on each cell when value is set", () => {
      render(<PinInput length={4} value="1234" onChange={() => {}} />);
      expect(screen.getByLabelText("Digit 1 of 4")).toBeInTheDocument();
      expect(screen.getByLabelText("Digit 4 of 4")).toBeInTheDocument();
    });

    it("renders cells as password type when mask=true and value is set", () => {
      render(<PinInput mask value="1234" length={4} onChange={() => {}} />);
      const cell1 = screen.getByLabelText("Digit 1 of 4");
      expect(cell1).toHaveAttribute("type", "password");
    });

    it("renders cells disabled when disabled=true and value is set", () => {
      render(<PinInput disabled value="1234" length={4} onChange={() => {}} />);
      const cell1 = screen.getByLabelText("Digit 1 of 4");
      expect(cell1).toBeDisabled();
    });
  });

  describe("controlled value", () => {
    it("renders with initial value", () => {
      render(<PinInput value="12" length={4} onChange={() => {}} />);
      expect(screen.getByLabelText("Digit 1 of 4")).toHaveValue("1");
      expect(screen.getByLabelText("Digit 2 of 4")).toHaveValue("2");
    });
  });

  describe("interactions", () => {
    it("calls onChange when typing into a cell", () => {
      const onChange = vi.fn();
      render(<PinInput value="1234" length={4} onChange={onChange} />);
      const cell = screen.getByLabelText("Digit 1 of 4");
      // Change to a new character
      fireEvent.change(cell, { target: { value: "5" } });
      expect(onChange).toHaveBeenCalledWith("5234");
    });

    it("calls onChange with updated string when cell value changes", () => {
      const onChange = vi.fn();
      render(
        <PinInput
          length={4}
          value="1234"
          onChange={onChange}
        />
      );
      const cell1 = screen.getByLabelText("Digit 1 of 4");
      fireEvent.change(cell1, { target: { value: "9" } });
      expect(onChange).toHaveBeenCalledWith("9234");
    });

    it("handles paste into a cell", () => {
      const onChange = vi.fn();
      render(<PinInput length={4} value="1234" onChange={onChange} />);
      const cell = screen.getByLabelText("Digit 1 of 4");
      fireEvent.paste(cell, {
        clipboardData: { getData: () => "5678" },
      });
      expect(onChange).toHaveBeenCalledWith("5678");
    });

    it("handles backspace to clear current cell", () => {
      const onChange = vi.fn();
      render(<PinInput length={4} value="1234" onChange={onChange} />);
      const cell4 = screen.getByLabelText("Digit 4 of 4");
      fireEvent.keyDown(cell4, { key: "Backspace" });
      expect(onChange).toHaveBeenCalledWith("123");
    });

    it("handles ArrowLeft to move focus left", () => {
      render(<PinInput length={4} value="1234" onChange={() => {}} />);
      const cell2 = screen.getByLabelText("Digit 2 of 4");
      fireEvent.keyDown(cell2, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(screen.getByLabelText("Digit 1 of 4"));
    });

    it("handles ArrowRight to move focus right", () => {
      render(<PinInput length={4} value="1234" onChange={() => {}} />);
      const cell1 = screen.getByLabelText("Digit 1 of 4");
      cell1.focus();
      fireEvent.keyDown(cell1, { key: "ArrowRight" });
      expect(document.activeElement).toBe(screen.getByLabelText("Digit 2 of 4"));
    });
  });

  describe("group role", () => {
    it("has role=group on the cells container", () => {
      render(<PinInput label="Code" />);
      expect(screen.getByRole("group")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("passes axe with value set", async () => {
      const { container } = render(
        <PinInput label="Verification code" length={4} value="1234" onChange={() => {}} />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

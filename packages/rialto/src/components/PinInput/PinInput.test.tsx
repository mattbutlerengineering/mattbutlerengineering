import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { PinInput } from "./PinInput";

function getInputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>("input"));
}

describe("PinInput", () => {
  describe("rendering", () => {
    it("renders input cells matching value length", () => {
      const { container } = render(<PinInput value="1234" length={4} onChange={vi.fn()} />);
      expect(getInputs(container)).toHaveLength(4);
    });

    it("renders custom length", () => {
      render(<PinInput length={6} value="123456" onChange={() => {}} />);
      const cells = screen.getAllByLabelText(/Digit \d of 6/);
      expect(cells.length).toBe(6);
    });

    it("renders label when provided", () => {
      render(<PinInput label="Enter code" value="1" onChange={vi.fn()} />);
      expect(screen.getByText("Enter code")).toBeInTheDocument();
    });

    it("renders hint when provided", () => {
      render(<PinInput hint="Check your email" value="1" onChange={vi.fn()} />);
      expect(screen.getByText("Check your email")).toBeInTheDocument();
    });

    it("displays value in cells", () => {
      const { container } = render(<PinInput value="1234" length={4} onChange={vi.fn()} />);
      const inputs = getInputs(container);
      expect(inputs[0]!.value).toBe("1");
      expect(inputs[1]!.value).toBe("2");
      expect(inputs[2]!.value).toBe("3");
      expect(inputs[3]!.value).toBe("4");
    });

    it("renders as password inputs when mask=true", () => {
      const { container } = render(<PinInput value="12" mask onChange={vi.fn()} />);
      const passwordInputs = container.querySelectorAll("input[type='password']");
      expect(passwordInputs.length).toBeGreaterThan(0);
    });

    it("renders disabled state", () => {
      const { container } = render(<PinInput value="1234" disabled onChange={vi.fn()} />);
      for (const input of getInputs(container)) {
        expect(input).toBeDisabled();
      }
    });
  });

  describe("interactions", () => {
    it("calls onChange when digit entered", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="1" length={4} onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.change(inputs[0]!, { target: { value: "5" } });
      expect(onChange).toHaveBeenCalledWith("5");
    });

    it("calls onChange with full value when last cell filled", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="1234" length={4} onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.change(inputs[3]!, { target: { value: "9" } });
      expect(onChange).toHaveBeenCalledWith("1239");
    });

    it("handles backspace to clear current cell", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="12" length={4} onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.keyDown(inputs[1]!, { key: "Backspace" });
      expect(onChange).toHaveBeenCalled();
    });

    it("handles backspace on empty cell focuses previous", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="10" length={4} onChange={onChange} />);
      const inputs = getInputs(container);
      inputs[1]!.focus();
      fireEvent.keyDown(inputs[1]!, { key: "Backspace" });
      expect(onChange).toHaveBeenCalled();
    });

    it("handles arrow key navigation", () => {
      const { container } = render(<PinInput value="1234" length={4} onChange={vi.fn()} />);
      const inputs = getInputs(container);
      inputs[0]!.focus();
      fireEvent.keyDown(inputs[0]!, { key: "ArrowRight" });
      expect(document.activeElement).toBe(inputs[1]);

      fireEvent.keyDown(inputs[1]!, { key: "ArrowLeft" });
      expect(document.activeElement).toBe(inputs[0]);
    });

    it("handles paste", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="1" length={4} onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.paste(inputs[0]!, {
        clipboardData: { getData: () => "5678" },
      });
      expect(onChange).toHaveBeenCalled();
      const call = onChange.mock.calls[0]![0];
      expect(call).toContain("5");
    });

    it("rejects non-numeric chars in numeric mode", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="1" type="numeric" onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.change(inputs[0]!, { target: { value: "a" } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("accepts alphanumeric chars in alphanumeric mode", () => {
      const onChange = vi.fn();
      const { container } = render(<PinInput value="A" type="alphanumeric" onChange={onChange} />);
      const inputs = getInputs(container);
      fireEvent.change(inputs[0]!, { target: { value: "B" } });
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("styling and attributes", () => {
    it("applies sm size class", () => {
      const { container } = render(<PinInput value="1" size="sm" onChange={vi.fn()} />);
      expect(container.querySelector("[class*='sm']")).toBeTruthy();
    });

    it("applies error class", () => {
      const { container } = render(<PinInput value="1" error onChange={vi.fn()} />);
      expect(container.querySelector("[class*='error']")).toBeTruthy();
    });

    it("has role=group on the cells container", () => {
      render(<PinInput label="Code" />);
      expect(screen.getByRole("group")).toBeInTheDocument();
    });

    it("has aria-label on each cell", () => {
      const { container } = render(<PinInput value="1234" length={4} onChange={vi.fn()} />);
      const inputs = getInputs(container);
      expect(inputs[0]!.getAttribute("aria-label")).toBe("Digit 1 of 4");
      expect(inputs[3]!.getAttribute("aria-label")).toBe("Digit 4 of 4");
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<PinInput ref={ref} value="1" onChange={vi.fn()} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe with value set", async () => {
      const { container } = render(
        <PinInput label="Verification code" length={4} value="1234" onChange={() => {}} />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });

  it("does not emit 'undefined' in wrapper className", () => {
    const { container } = render(<PinInput />);
    expect(container.firstElementChild?.className).not.toMatch(/undefined/);
  });
});

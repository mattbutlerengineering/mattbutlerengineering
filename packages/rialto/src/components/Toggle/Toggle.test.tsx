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
});

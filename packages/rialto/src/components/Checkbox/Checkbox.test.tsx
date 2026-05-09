import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  describe("rendering", () => {
    it("renders with a label", () => {
      render(<Checkbox label="Accept terms" />);
      expect(screen.getByLabelText("Accept terms")).toBeInTheDocument();
    });

    it("renders the checkbox input", () => {
      render(<Checkbox label="Check me" />);
      expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(<Checkbox label="Subscribe" description="Get weekly emails" />);
      expect(screen.getByText("Get weekly emails")).toBeInTheDocument();
    });

    it("associates description via aria-describedby", () => {
      render(<Checkbox label="Subscribe" description="Get weekly emails" />);
      const checkbox = screen.getByRole("checkbox");
      const descId = checkbox.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      const desc = document.getElementById(descId!);
      expect(desc).toHaveTextContent("Get weekly emails");
    });
  });

  describe("checked state", () => {
    it("is unchecked by default", () => {
      render(<Checkbox label="Check" />);
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });

    it("renders checked when checked=true", () => {
      render(<Checkbox label="Checked" checked onCheckedChange={() => {}} />);
      expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("calls onCheckedChange with true when unchecked checkbox is clicked", async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox label="Toggle" checked={false} onCheckedChange={onCheckedChange} />);
      await user.click(screen.getByRole("checkbox"));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it("calls onCheckedChange with false when checked checkbox is clicked", async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox label="Toggle" checked={true} onCheckedChange={onCheckedChange} />);
      await user.click(screen.getByRole("checkbox"));
      expect(onCheckedChange).toHaveBeenCalledWith(false);
    });
  });

  describe("indeterminate state", () => {
    it("sets the indeterminate property on the native checkbox", () => {
      render(<Checkbox label="Select all" indeterminate />);
      const input = screen.getByRole("checkbox") as HTMLInputElement;
      expect(input.indeterminate).toBe(true);
    });

    it("sets data-indeterminate attribute", () => {
      render(<Checkbox label="Select all" indeterminate />);
      const input = screen.getByRole("checkbox");
      expect(input).toHaveAttribute("data-indeterminate");
    });
  });

  describe("disabled state", () => {
    it("renders disabled input when disabled=true", () => {
      render(<Checkbox label="Disabled" disabled />);
      expect(screen.getByRole("checkbox")).toBeDisabled();
    });

    it("does not call onCheckedChange when disabled", async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(<Checkbox label="Disabled" disabled onCheckedChange={onCheckedChange} />);
      await user.click(screen.getByRole("checkbox"));
      expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it("sets aria-disabled on the wrapper", () => {
      const { container } = render(<Checkbox label="Disabled" disabled />);
      const wrapper = container.firstElementChild;
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Checkbox ref={ref} label="Ref" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

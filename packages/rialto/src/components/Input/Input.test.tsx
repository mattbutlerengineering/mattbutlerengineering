import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
  describe("rendering", () => {
    it("renders an input element", () => {
      render(<Input />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders label when provided", () => {
      render(<Input label="Email" />);
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });

    it("renders hint text below the input", () => {
      render(<Input hint="Use your work email" />);
      expect(screen.getByText("Use your work email")).toBeInTheDocument();
    });

    it("associates hint via aria-describedby", () => {
      render(<Input hint="Use your work email" />);
      const input = screen.getByRole("textbox");
      const hintId = input.getAttribute("aria-describedby");
      expect(hintId).toBeTruthy();
      const hintEl = document.getElementById(hintId!);
      expect(hintEl).toHaveTextContent("Use your work email");
    });

    it("renders startIcon when provided", () => {
      render(<Input startIcon={<span data-testid="start-icon" />} />);
      expect(screen.getByTestId("start-icon")).toBeInTheDocument();
    });

    it("renders endIcon when provided", () => {
      render(<Input endIcon={<span data-testid="end-icon" />} />);
      expect(screen.getByTestId("end-icon")).toBeInTheDocument();
    });

    it("shows (optional) suffix when showOptional and not required", () => {
      render(<Input label="Phone" showOptional />);
      expect(screen.getByText("(optional)", { exact: false })).toBeInTheDocument();
    });

    it("does not show (optional) when required is true", () => {
      render(<Input label="Phone" showOptional required />);
      expect(screen.queryByText("(optional)", { exact: false })).not.toBeInTheDocument();
    });

    it("shows required asterisk when required", () => {
      render(<Input label="Name" required />);
      expect(screen.getByText("*", { exact: false })).toBeInTheDocument();
    });
  });

  describe("controlled input", () => {
    it("displays controlled value", () => {
      render(<Input value="hello" onChange={() => {}} />);
      expect(screen.getByRole("textbox")).toHaveValue("hello");
    });

    it("calls onChange on user input", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Input value="" onChange={onChange} />);
      await user.type(screen.getByRole("textbox"), "a");
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("uncontrolled input", () => {
    it("accepts user input when uncontrolled", async () => {
      const user = userEvent.setup();
      render(<Input placeholder="Type here" />);
      const input = screen.getByRole("textbox");
      await user.type(input, "hello");
      expect(input).toHaveValue("hello");
    });

    it("uses defaultValue as initial value", () => {
      render(<Input defaultValue="initial" />);
      expect(screen.getByRole("textbox")).toHaveValue("initial");
    });
  });

  describe("validation / error state", () => {
    it("applies aria-invalid when error is true", () => {
      render(<Input error />);
      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    });

    it("does not apply aria-invalid when error is false", () => {
      render(<Input />);
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
    });

    it("applies error class to wrapper when error is true", () => {
      const { container } = render(<Input error />);
      const wrapper = container.firstElementChild;
      expect(wrapper?.className).toMatch(/error/);
    });

    it("error message is programmatically associated with the control via aria-describedby", () => {
      render(<Input error hint="This field is required" />);
      const input = screen.getByRole("textbox");
      const describedById = input.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      const messageEl = document.getElementById(describedById!);
      expect(messageEl).toHaveTextContent("This field is required");
    });

    it("aria-invalid is set when error=true and hint is absent (no dangling aria-describedby)", () => {
      render(<Input error />);
      const input = screen.getByRole("textbox");
      // aria-invalid=true signals the error state
      expect(input).toHaveAttribute("aria-invalid", "true");
      // No hint element is rendered, so aria-describedby must not reference a non-existent element
      expect(input).not.toHaveAttribute("aria-describedby");
    });
  });

  describe("disabled state", () => {
    it("renders disabled input", () => {
      render(<Input disabled />);
      expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("does not accept typing when disabled", async () => {
      const user = userEvent.setup();
      render(<Input disabled />);
      const input = screen.getByRole("textbox");
      await user.type(input, "test");
      expect(input).toHaveValue("");
    });
  });

  describe("focus management", () => {
    it("receives focus on tab", async () => {
      const user = userEvent.setup();
      render(<Input />);
      await user.tab();
      expect(screen.getByRole("textbox")).toHaveFocus();
    });

    it("forwards ref to the input element", () => {
      const ref = { current: null as HTMLInputElement | null };
      render(<Input ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe("placeholder", () => {
    it("renders placeholder attribute", () => {
      render(<Input placeholder="Search..." />);
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
  });

  describe("readOnly", () => {
    it("sets readOnly attribute on the input", () => {
      render(<Input readOnly value="fixed" onChange={() => {}} />);
      expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    });
  });

  describe("icon input classes", () => {
    it("applies inputWithStartIcon class when startIcon provided", () => {
      const { container } = render(<Input startIcon={<span data-testid="si" />} />);
      const input = container.querySelector("input");
      expect(input?.className).toMatch(/inputWithStartIcon/);
    });

    it("applies inputWithEndIcon class when endIcon provided", () => {
      const { container } = render(<Input endIcon={<span data-testid="ei" />} />);
      const input = container.querySelector("input");
      expect(input?.className).toMatch(/inputWithEndIcon/);
    });

    it("does not apply icon classes when no icons provided", () => {
      const { container } = render(<Input />);
      const input = container.querySelector("input");
      expect(input?.className).not.toMatch(/inputWithStartIcon/);
      expect(input?.className).not.toMatch(/inputWithEndIcon/);
    });
  });

  describe("disabledReason", () => {
    it("renders lock icon when disabled and disabledReason is provided", () => {
      const { container } = render(<Input disabled disabledReason="Admin only" />);
      expect(container.querySelector('[class*="lockIcon"]')).toBeInTheDocument();
    });

    it("does not render lock icon when not disabled", () => {
      const { container } = render(<Input disabledReason="Admin only" />);
      expect(container.querySelector('[class*="lockIcon"]')).not.toBeInTheDocument();
    });
  });

  describe("no label", () => {
    it("renders without label element when label is omitted", () => {
      render(<Input placeholder="No label" />);
      expect(screen.queryByRole("label")).not.toBeInTheDocument();
    });
  });

  describe("custom id forwarding", () => {
    it("uses provided id on the input element", () => {
      render(<Input id="my-input" label="Field" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("id", "my-input");
    });
  });
});

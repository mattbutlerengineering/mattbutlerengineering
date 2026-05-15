import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox, Radio, RadioGroup } from "./Checkbox";

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

  describe("disabled with reason", () => {
    it("shows lock icon when disabled with disabledReason", () => {
      const { container } = render(
        <Checkbox label="Locked" disabled disabledReason="Permission denied" />
      );
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });
});

describe("Radio", () => {
  it("renders label", () => {
    render(<Radio label="Option A" value="a" />);
    expect(screen.getByText("Option A")).toBeInTheDocument();
  });

  it("renders radio input", () => {
    render(<Radio label="Option A" value="a" />);
    expect(screen.getByRole("radio")).toBeInTheDocument();
  });

  it("calls onCheckedChange with value on click", async () => {
    const onChange = vi.fn();
    render(<Radio label="Option A" value="a" onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole("radio"));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders description text", () => {
    render(<Radio label="A" value="a" description="Extra info" />);
    expect(screen.getByText("Extra info")).toBeInTheDocument();
  });

  it("renders disabled state", () => {
    render(<Radio label="A" value="a" disabled />);
    expect(screen.getByRole("radio")).toBeDisabled();
  });

  it("shows lock icon when disabled with reason", () => {
    const { container } = render(<Radio label="A" value="a" disabled disabledReason="No access" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Radio ref={ref} label="A" value="a" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe("RadioGroup", () => {
  it("renders fieldset with radiogroup role", () => {
    render(
      <RadioGroup name="size" value="sm" onChange={vi.fn()}>
        <Radio label="Small" value="sm" />
        <Radio label="Large" value="lg" />
      </RadioGroup>
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("renders legend when label provided", () => {
    render(
      <RadioGroup label="Size" name="size" value="sm" onChange={vi.fn()}>
        <Radio label="Small" value="sm" />
      </RadioGroup>
    );
    expect(screen.getByText("Size")).toBeInTheDocument();
  });

  it("marks correct radio as checked", () => {
    render(
      <RadioGroup name="size" value="lg" onChange={vi.fn()}>
        <Radio label="Small" value="sm" />
        <Radio label="Large" value="lg" />
      </RadioGroup>
    );
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
  });

  it("calls onChange when radio selected", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup name="size" value="sm" onChange={onChange}>
        <Radio label="Small" value="sm" />
        <Radio label="Large" value="lg" />
      </RadioGroup>
    );
    await userEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onChange).toHaveBeenCalledWith("lg");
  });

  it("forwards ref to fieldset", () => {
    const ref = { current: null as HTMLFieldSetElement | null };
    render(
      <RadioGroup ref={ref} name="size" value="sm" onChange={vi.fn()}>
        <Radio label="Small" value="sm" />
      </RadioGroup>
    );
    expect(ref.current).toBeInstanceOf(HTMLFieldSetElement);
  });

  it("renders non-element children as-is", () => {
    render(
      <RadioGroup name="size" value="sm" onChange={vi.fn()}>
        {null}
        <Radio label="Small" value="sm" />
      </RadioGroup>
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });
});

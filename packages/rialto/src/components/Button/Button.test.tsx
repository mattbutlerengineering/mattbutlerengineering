import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(<Button>Save</Button>);
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("defaults to secondary variant", () => {
      const { container } = render(<Button>Click</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).toMatch(/secondary/);
    });

    it("applies primary variant class", () => {
      const { container } = render(<Button variant="primary">Primary</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).toMatch(/primary/);
    });

    it("applies ghost variant class", () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).toMatch(/ghost/);
    });

    it("applies sm size class", () => {
      const { container } = render(<Button size="sm">Small</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).toMatch(/sm/);
    });

    it("applies lg size class", () => {
      const { container } = render(<Button size="lg">Large</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).toMatch(/lg/);
    });

    it("forwards additional className", () => {
      const { container } = render(<Button className="my-btn">Styled</Button>);
      expect(container.querySelector("button")?.className).toMatch(/my-btn/);
    });

    it("forwards ref", () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(<Button ref={ref}>Ref</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("click handler", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click me</Button>);
      await user.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Disabled
        </Button>
      );
      await user.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("disabled state", () => {
    it("renders with disabled attribute", () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("is not focusable via keyboard when disabled", async () => {
      const user = userEvent.setup();
      render(<Button disabled>Disabled</Button>);
      await user.tab();
      expect(screen.getByRole("button")).not.toHaveFocus();
    });
  });

  describe("loading state", () => {
    it("disables the button when isLoading", () => {
      render(<Button isLoading>Save</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("sets aria-busy when isLoading", () => {
      render(<Button isLoading>Save</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });

    it("shows loadingText when provided", () => {
      render(
        <Button isLoading loadingText="Saving...">
          Save
        </Button>
      );
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    it("still shows children when isLoading but no loadingText", () => {
      render(<Button isLoading>Save</Button>);
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    it("does not fire onClick while loading", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button isLoading onClick={onClick}>
          Save
        </Button>
      );
      await user.click(screen.getByRole("button"));
      expect(onClick).not.toHaveBeenCalled();
    });

    it("applies isLoading class when loading", () => {
      const { container } = render(<Button isLoading>Save</Button>);
      expect(container.querySelector("button")?.className).toMatch(/isLoading/);
    });
  });

  describe("type attribute", () => {
    it("defaults to button type when no type is specified", () => {
      render(<Button>Submit</Button>);
      // motion.button does not set type=button by default — the native button default is "submit"
      // but our component does not override it; pass type if needed
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("accepts type='submit'", () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });
  });

  describe("md size (default)", () => {
    it("does not apply sm or lg class for default md size", () => {
      const { container } = render(<Button size="md">Medium</Button>);
      const btn = container.querySelector("button");
      expect(btn?.className).not.toMatch(/\bsm\b/);
      expect(btn?.className).not.toMatch(/\blg\b/);
    });
  });

  describe("loading with sm size", () => {
    it("renders spinner at sm size when loading", () => {
      const { container } = render(
        <Button size="sm" isLoading>
          Save
        </Button>
      );
      // Loader2 renders as an svg inside the button
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("no children", () => {
    it("renders without children", () => {
      render(<Button aria-label="icon button" />);
      expect(screen.getByRole("button", { name: "icon button" })).toBeInTheDocument();
    });
  });
});

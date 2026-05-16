import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Tag, AnimatedTag, TagGroup } from "./Tag";

describe("Tag", () => {
  describe("static rendering", () => {
    it("renders label text", () => {
      render(<Tag>Telemetry</Tag>);
      expect(screen.getByText("Telemetry")).toBeInTheDocument();
    });

    it("renders as a span when no onClick is provided", () => {
      const { container } = render(<Tag>Label</Tag>);
      expect(container.querySelector("span")).toBeInTheDocument();
      expect(container.querySelector("button")).not.toBeInTheDocument();
    });

    it("renders with accent variant", () => {
      const { container } = render(<Tag variant="accent">Accent</Tag>);
      expect(container.querySelector("[class*='accent']")).toBeInTheDocument();
    });

    it("renders with success variant", () => {
      const { container } = render(<Tag variant="success">Success</Tag>);
      expect(container.querySelector("[class*='success']")).toBeInTheDocument();
    });

    it("renders with error variant", () => {
      const { container } = render(<Tag variant="error">Error</Tag>);
      expect(container.querySelector("[class*='error']")).toBeInTheDocument();
    });

    it("renders icon when provided", () => {
      render(<Tag icon={<svg data-testid="tag-icon" />}>With Icon</Tag>);
      expect(screen.getByTestId("tag-icon")).toBeInTheDocument();
    });
  });

  describe("interactive tag (onClick)", () => {
    it("renders as a button when onClick is provided", () => {
      render(<Tag onClick={() => {}}>Clickable</Tag>);
      expect(screen.getByRole("button", { name: /clickable/i })).toBeInTheDocument();
    });

    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(<Tag onClick={onClick}>Clickable</Tag>);
      await user.click(screen.getByRole("button", { name: /clickable/i }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("renders selected state", () => {
      const { container } = render(
        <Tag onClick={() => {}} selected>
          Selected
        </Tag>
      );
      expect(container.querySelector("[class*='selected']")).toBeInTheDocument();
    });
  });

  describe("dismissible variant", () => {
    it("renders dismiss button when dismissible=true", () => {
      render(<Tag dismissible>Removable</Tag>);
      expect(screen.getByRole("button", { name: /remove removable/i })).toBeInTheDocument();
    });

    it("does not render dismiss button by default", () => {
      render(<Tag>Static</Tag>);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Tag dismissible onDismiss={onDismiss}>
          Removable
        </Tag>
      );
      await user.click(screen.getByRole("button", { name: /remove removable/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("does not trigger onClick when dismiss button is clicked on interactive tag", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const onDismiss = vi.fn();
      render(
        <Tag onClick={onClick} dismissible onDismiss={onDismiss}>
          Both
        </Tag>
      );
      await user.click(screen.getByRole("button", { name: /remove both/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to span for static tag", () => {
      const ref = { current: null as HTMLElement | null };
      render(<Tag ref={ref}>Label</Tag>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it("forwards ref to button for interactive tag", () => {
      const ref = { current: null as HTMLElement | null };
      render(
        <Tag ref={ref} onClick={() => {}}>
          Button Tag
        </Tag>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations for static tag", async () => {
      const { container } = render(<Tag variant="accent">Telemetry</Tag>);
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });

    it("has no a11y violations for dismissible tag", async () => {
      const { container } = render(
        <Tag dismissible onDismiss={() => {}}>
          Removable
        </Tag>
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });

    it("has no a11y violations for interactive tag", async () => {
      const { container } = render(<Tag onClick={() => {}}>Clickable</Tag>);
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});

describe("AnimatedTag", () => {
  it("renders label text", () => {
    render(
      <TagGroup>
        <AnimatedTag id="t1">Label</AnimatedTag>
      </TagGroup>
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
  });

  it("passes dismissible and onDismiss to inner Tag", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <TagGroup>
        <AnimatedTag id="t1" dismissible onDismiss={onDismiss}>
          Removable
        </AnimatedTag>
      </TagGroup>
    );
    await user.click(screen.getByRole("button", { name: /remove removable/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("TagGroup", () => {
  it("renders children", () => {
    render(
      <TagGroup>
        <Tag>Alpha</Tag>
        <Tag>Beta</Tag>
      </TagGroup>
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <TagGroup className="custom-group">
        <Tag>Item</Tag>
      </TagGroup>
    );
    expect(container.firstChild).toHaveClass("custom-group");
  });
});

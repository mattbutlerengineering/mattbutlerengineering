import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    it("exposes aria-pressed on toggle tags and omits it on plain clickable tags", () => {
      render(
        <>
          <Tag onClick={() => {}} selected>
            V6
          </Tag>
          <Tag onClick={() => {}} selected={false}>
            V8
          </Tag>
          <Tag onClick={() => {}}>Plain</Tag>
        </>
      );
      expect(screen.getByRole("button", { name: "V6" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "V8" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "Plain" })).not.toHaveAttribute("aria-pressed");
    });

    it("exposes aria-pressed on the label when a toggle tag is also dismissible", () => {
      render(
        <Tag onClick={() => {}} dismissible onDismiss={() => {}} selected>
          V6
        </Tag>
      );
      expect(screen.getByRole("button", { name: "V6" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /remove v6/i })).not.toHaveAttribute(
        "aria-pressed"
      );
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

    it("has no a11y violations for interactive + dismissible tag", async () => {
      const { container } = render(
        <Tag onClick={() => {}} dismissible onDismiss={() => {}}>
          Filter
        </Tag>
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });

    it("does not nest the dismiss button inside the interactive tag button", () => {
      render(
        <Tag onClick={() => {}} dismissible onDismiss={() => {}}>
          Filter
        </Tag>
      );
      const dismiss = screen.getByRole("button", { name: /remove filter/i });
      const main = screen.getByRole("button", { name: "Filter" });
      expect(main.contains(dismiss)).toBe(false);
    });
  });
});

describe("AnimatedTag", () => {
  it("renders with id prop", () => {
    render(<AnimatedTag id="tag-1">Alpha</AnimatedTag>);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
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

describe("AnimatedTag rapid dismiss", () => {
  function DismissList() {
    const [tags, setTags] = useState(["Fiorano", "Monza", "Mugello", "Imola", "Spa"]);
    return (
      <>
        <TagGroup>
          {tags.map((tag) => (
            <AnimatedTag
              key={tag}
              id={tag}
              dismissible
              onDismiss={() => setTags((prev) => prev.filter((item) => item !== tag))}
            >
              {tag}
            </AnimatedTag>
          ))}
        </TagGroup>
        <span data-testid="left">{tags.join(",")}</span>
      </>
    );
  }

  it("removes every tag when each dismiss is clicked before the exit animation ends", async () => {
    render(<DismissList />);
    for (const name of ["Fiorano", "Monza", "Mugello", "Imola", "Spa"]) {
      fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
    }
    expect(screen.getByTestId("left").textContent).toBe("");
    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: /Remove / })).toHaveLength(0);
    });
  });

  it("does not layout-animate chips, so a dismiss reflow cannot slide the rest out from under a click", () => {
    const source = readFileSync(join(import.meta.dirname, "Tag.tsx"), "utf8");
    const start = source.indexOf("export const AnimatedTag");
    const end = source.indexOf("AnimatedTag.displayName");
    const animated = source
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(animated).not.toMatch(/\blayout\b/);
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

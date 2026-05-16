import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heading } from "./Heading";

describe("Heading", () => {
  it("renders an h2 by default at size 2", () => {
    render(<Heading>Section</Heading>);
    const el = screen.getByRole("heading", { level: 2 });
    expect(el).toHaveTextContent("Section");
  });

  it.each([1, 2, 3, 4, 5, 6] as const)("renders h%i when level=%i", (level) => {
    render(<Heading level={level}>Title {level}</Heading>);
    expect(screen.getByRole("heading", { level })).toBeInTheDocument();
  });

  it("decouples size from level — h2 rendered at size 1", () => {
    render(
      <Heading level={2} size={1} data-testid="h">
        Big h2
      </Heading>
    );
    const el = screen.getByTestId("h");
    expect(el.tagName.toLowerCase()).toBe("h2");
    // size1 class applied
    expect(el.className).toMatch(/size1/);
  });

  it("renders as a different element via `as` prop without losing styling", () => {
    render(
      <Heading as="div" level={3} data-testid="h">
        Visual only
      </Heading>
    );
    const el = screen.getByTestId("h");
    expect(el.tagName.toLowerCase()).toBe("div");
    // Still picks up the size class from level
    expect(el.className).toMatch(/size3/);
  });

  it("applies color and align modifiers", () => {
    render(
      <Heading color="accent" align="center" data-testid="h">
        Tokenized
      </Heading>
    );
    const el = screen.getByTestId("h");
    expect(el.className).toMatch(/colorAccent/);
    expect(el.className).toMatch(/alignCenter/);
  });

  it("applies truncate modifier", () => {
    render(
      <Heading truncate data-testid="h">
        Long heading that should clip with an ellipsis
      </Heading>
    );
    expect(screen.getByTestId("h").className).toMatch(/truncate/);
  });

  it("forwards arbitrary HTML attributes (id, aria-*)", () => {
    render(
      <Heading id="dialog-title" aria-describedby="dialog-desc">
        Dialog
      </Heading>
    );
    const el = screen.getByRole("heading");
    expect(el).toHaveAttribute("id", "dialog-title");
    expect(el).toHaveAttribute("aria-describedby", "dialog-desc");
  });

  it("forwards ref to the heading element", () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(<Heading ref={ref}>Ref test</Heading>);
    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });

  it.each([
    "primary",
    "secondary",
    "tertiary",
    "success",
    "warning",
    "error",
    "on-accent",
  ] as const)("applies %s color class", (color) => {
    render(
      <Heading color={color} data-testid="h">
        Text
      </Heading>
    );
    const el = screen.getByTestId("h");
    // colorOnAccent for "on-accent", colorPrimary for "primary", etc.
    const expectedFragment =
      color === "on-accent"
        ? "colorOnAccent"
        : `color${color.charAt(0).toUpperCase() + color.slice(1)}`;
    expect(el.className).toMatch(new RegExp(expectedFragment));
  });

  it("applies left align class", () => {
    render(
      <Heading align="left" data-testid="h">
        Left
      </Heading>
    );
    expect(screen.getByTestId("h").className).toMatch(/alignLeft/);
  });

  it("applies right align class", () => {
    render(
      <Heading align="right" data-testid="h">
        Right
      </Heading>
    );
    expect(screen.getByTestId("h").className).toMatch(/alignRight/);
  });

  it("applies all size classes for sizes 4, 5, 6", () => {
    for (const size of [4, 5, 6] as const) {
      const { unmount } = render(
        <Heading size={size} data-testid="h">
          Size {size}
        </Heading>
      );
      expect(screen.getByTestId("h").className).toMatch(new RegExp(`size${size}`));
      unmount();
    }
  });
});

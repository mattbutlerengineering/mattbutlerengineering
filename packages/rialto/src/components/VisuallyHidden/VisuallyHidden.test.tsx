import { render, screen } from "@testing-library/react";
import { VisuallyHidden } from "./VisuallyHidden";

describe("VisuallyHidden", () => {
  it("contributes to a parent button's accessible name", () => {
    render(
      <button type="button">
        <svg aria-hidden="true" />
        <VisuallyHidden>Close</VisuallyHidden>
      </button>
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders a span in the accessibility tree", () => {
    render(<VisuallyHidden>Hidden text</VisuallyHidden>);
    expect(screen.getByText("Hidden text").tagName).toBe("SPAN");
  });

  it("applies the visually-hidden class and passes props through", () => {
    render(
      <VisuallyHidden className="custom" data-testid="vh">
        text
      </VisuallyHidden>
    );
    const el = screen.getByTestId("vh");
    expect(el.className).toMatch(/root/);
    expect(el.className).toMatch(/custom/);
  });

  it("adds the focusable class only when focusable", () => {
    const { rerender } = render(<VisuallyHidden data-testid="vh">text</VisuallyHidden>);
    expect(screen.getByTestId("vh").className).not.toMatch(/focusable/);
    rerender(
      <VisuallyHidden focusable data-testid="vh">
        text
      </VisuallyHidden>
    );
    expect(screen.getByTestId("vh").className).toMatch(/focusable/);
  });

  it("forwards ref to the span", () => {
    const ref = { current: null as HTMLSpanElement | null };
    render(<VisuallyHidden ref={ref}>text</VisuallyHidden>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});

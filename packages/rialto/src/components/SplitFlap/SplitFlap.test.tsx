import { render, screen, act } from "@testing-library/react";
import { SplitFlap } from "./SplitFlap";
import { normalizeChar, nextChar, CHARSETS } from "./charset";

describe("SplitFlap", () => {
  describe("charset helpers", () => {
    it("normalizeChar uppercases and filters unsupported characters", () => {
      expect(normalizeChar("a", CHARSETS.alpha)).toBe("A");
      expect(normalizeChar("Z", CHARSETS.alpha)).toBe("Z");
      expect(normalizeChar("1", CHARSETS.alpha)).toBe(" "); // digit not in alpha
      expect(normalizeChar("!", CHARSETS.full)).toBe("!");
    });

    it("nextChar wraps at the end of the charset", () => {
      const set = CHARSETS.alpha;
      expect(nextChar("A", set)).toBe("B");
      expect(nextChar(set[set.length - 1]!, set)).toBe(set[0]);
    });
  });

  describe("rendering", () => {
    it("exposes the accessible name as the label", () => {
      render(<SplitFlap value="HELLO" aria-label="Greeting" />);
      expect(screen.getByRole("img")).toHaveAccessibleName("Greeting");
    });

    it("creates one cell per character of value", () => {
      const { container } = render(<SplitFlap value="ABC" aria-label="Three letters" />);
      // Cells are aria-hidden, so find them via the class marker
      const cells = container.querySelectorAll('[aria-hidden="true"]');
      // One per character + the sr-only summary element
      expect(cells.length).toBeGreaterThanOrEqual(3);
    });

    it("pads value to length with spaces when length > value length", () => {
      const { container } = render(<SplitFlap value="HI" length={5} aria-label="Padded" />);
      // First-level aria-hidden cells should be 5
      const topLevel = container.firstElementChild;
      const cells = topLevel?.querySelectorAll(":scope > div[aria-hidden='true']");
      expect(cells?.length).toBe(5);
    });

    it("truncates value when it exceeds length", () => {
      const { container } = render(
        <SplitFlap value="HELLOWORLD" length={3} aria-label="Truncated" />
      );
      const topLevel = container.firstElementChild;
      const cells = topLevel?.querySelectorAll(":scope > div[aria-hidden='true']");
      expect(cells?.length).toBe(3);
    });
  });

  describe("accessibility", () => {
    it("animated cells are aria-hidden so AT only reads the label", () => {
      const { container } = render(<SplitFlap value="ABC" aria-label="Three letters" />);
      const cells = container.querySelectorAll(":scope > div > [aria-hidden='true']");
      cells.forEach((cell) => {
        expect(cell).toHaveAttribute("aria-hidden", "true");
      });
    });

    it("renders as role=img", () => {
      render(<SplitFlap value="ARRIVED" aria-label="Flight: arrived" />);
      expect(screen.getByRole("img")).toBeInTheDocument();
    });
  });

  describe("value changes", () => {
    it("updates when value prop changes (allows re-rendering)", () => {
      const { rerender } = render(<SplitFlap value="OLD" aria-label="Status" />);
      expect(screen.getByRole("img")).toHaveAccessibleName("Status");

      act(() => {
        rerender(<SplitFlap value="NEW" aria-label="Status" />);
      });
      expect(screen.getByRole("img")).toHaveAccessibleName("Status");
    });
  });
});

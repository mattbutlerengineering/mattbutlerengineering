import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { highlightEmbedCode } from "./highlight-embed-code.js";

vi.mock("./BookingWidgetDemoPage.module.css", () => ({
  default: {
    syntaxComment: "syntaxComment",
    syntaxTag: "syntaxTag",
    syntaxString: "syntaxString",
  },
}));

function renderHighlighted(code: string) {
  const { container } = render(
    <pre>
      <code>{highlightEmbedCode(code)}</code>
    </pre>
  );
  return container;
}

describe("highlightEmbedCode", () => {
  it("highlights HTML comments", () => {
    const container = renderHighlighted("<!-- comment -->");
    const span = container.querySelector(".syntaxComment");
    expect(span?.textContent).toBe("<!-- comment -->");
  });

  it("highlights HTML tags", () => {
    const container = renderHighlighted('<div id="test">');
    const span = container.querySelector(".syntaxTag");
    expect(span?.textContent).toBe('<div id="test">');
  });

  it("highlights self-closing tags", () => {
    const container = renderHighlighted("<br/>");
    const span = container.querySelector(".syntaxTag");
    expect(span?.textContent).toBe("<br/>");
  });

  it("highlights closing tags", () => {
    const container = renderHighlighted("</script>");
    const span = container.querySelector(".syntaxTag");
    expect(span?.textContent).toBe("</script>");
  });

  it("highlights single-quoted strings", () => {
    const container = renderHighlighted("'hello'");
    const span = container.querySelector(".syntaxString");
    expect(span?.textContent).toBe("'hello'");
  });

  it("highlights double-quoted strings", () => {
    const container = renderHighlighted('"world"');
    const span = container.querySelector(".syntaxString");
    expect(span?.textContent).toBe('"world"');
  });

  it("highlights JS line comments", () => {
    const container = renderHighlighted("  // Optional customization");
    const span = container.querySelector(".syntaxComment");
    expect(span?.textContent).toBe("// Optional customization");
  });

  it("renders plain text without highlight class", () => {
    const container = renderHighlighted("abc");
    const spans = container.querySelectorAll("span");
    const textSpans = Array.from(spans).filter(
      (s) =>
        !s.classList.contains("syntaxComment") &&
        !s.classList.contains("syntaxTag") &&
        !s.classList.contains("syntaxString")
    );
    expect(textSpans.some((s) => s.textContent?.includes("a"))).toBe(true);
  });

  it("handles multi-line code", () => {
    const code = "<div>\n  text\n</div>";
    const result = highlightEmbedCode(code);
    expect(result).toHaveLength(3);
  });

  it("preserves newlines between lines", () => {
    const container = renderHighlighted("line1\nline2");
    expect(container.textContent).toContain("line1");
    expect(container.textContent).toContain("line2");
  });

  it("handles empty string", () => {
    const result = highlightEmbedCode("");
    expect(result).toHaveLength(1);
  });

  it("highlights full embed code snippet", () => {
    const code = `<!-- Add to your website -->
<div id="booking-widget"></div>
<script src="https://example.com/widget.js"></script>
<script>
  BookingWidget.init({
    container: '#booking-widget',
    venueId: 'abc123',
    // Optional customization
    maxPartySize: 8,
  });
</script>`;
    const container = renderHighlighted(code);
    expect(container.querySelectorAll(".syntaxComment").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".syntaxTag").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".syntaxString").length).toBeGreaterThan(0);
  });
});

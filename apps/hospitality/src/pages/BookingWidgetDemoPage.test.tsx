import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { highlightEmbedCode } from "./highlight-embed-code.js";

describe("highlightEmbedCode", () => {
  function renderHighlighted(code: string) {
    const nodes = highlightEmbedCode(code);
    const { container } = render(
      <pre>
        <code>{nodes}</code>
      </pre>
    );
    return container;
  }

  it("highlights simple HTML tags", () => {
    const container = renderHighlighted("<div></div>");
    const tags = container.querySelectorAll(".syntaxTag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toBe("<div>");
    expect(tags[1].textContent).toBe("</div>");
  });

  it("highlights tags with attributes", () => {
    const container = renderHighlighted('<div id="booking-widget"></div>');
    const tags = container.querySelectorAll(".syntaxTag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toBe('<div id="booking-widget">');
  });

  it("highlights self-closing tags", () => {
    const container = renderHighlighted("<br/>");
    const tags = container.querySelectorAll(".syntaxTag");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("<br/>");
  });

  it("highlights HTML comments", () => {
    const container = renderHighlighted("<!-- Add to your website -->");
    const comments = container.querySelectorAll(".syntaxComment");
    expect(comments).toHaveLength(1);
    expect(comments[0].textContent).toBe("<!-- Add to your website -->");
  });

  it("highlights script tags with src attribute", () => {
    const container = renderHighlighted(
      '<script src="https://mattbutlerengineering.com/widget.js"></script>'
    );
    const tags = container.querySelectorAll(".syntaxTag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toBe('<script src="https://mattbutlerengineering.com/widget.js">');
    expect(tags[1].textContent).toBe("</script>");
  });

  it("highlights JS-style comments inside script blocks", () => {
    const container = renderHighlighted("  // Optional customization");
    const comments = container.querySelectorAll(".syntaxComment");
    expect(comments).toHaveLength(1);
    expect(comments[0].textContent).toBe("// Optional customization");
  });

  it("highlights quoted strings", () => {
    const container = renderHighlighted("  container: '#booking-widget',");
    const strings = container.querySelectorAll(".syntaxString");
    expect(strings).toHaveLength(1);
    expect(strings[0].textContent).toBe("'#booking-widget'");
  });

  it("does not hang on adversarial input with nested angle brackets", () => {
    // Input that could cause issues with naive [^>]* patterns
    const adversarial = '<img src=">" onerror="alert(1)">';
    const start = performance.now();
    renderHighlighted(adversarial);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("handles multi-line embed code correctly", () => {
    const code = `<!-- Widget -->
<div id="app"></div>
<script>
  // init
</script>`;
    const container = renderHighlighted(code);
    const tags = container.querySelectorAll(".syntaxTag");
    const comments = container.querySelectorAll(".syntaxComment");
    // <div id="app">, </div>, <script>, </script>
    expect(tags).toHaveLength(4);
    // <!-- Widget --> and // init
    expect(comments).toHaveLength(2);
  });
});
